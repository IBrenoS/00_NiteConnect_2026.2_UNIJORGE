package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.List;
import java.util.UUID;
import java.util.ArrayList;

@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentPurgeService {
    private final AccessService access;
    private final DocumentCapabilityService capabilities;
    private final DocumentPurgeRepository repository;
    private final boolean purgeWorkerEnabled;
    private final TransactionTemplate transactions;

    public DocumentPurgeService(AccessService access,DocumentCapabilityService capabilities,DocumentPurgeRepository repository,
                                @Value("${nite.documents.purge.worker-enabled:false}") boolean purgeWorkerEnabled,
                                TransactionTemplate transactions) {
        this.access=access;this.capabilities=capabilities;this.repository=repository;this.purgeWorkerEnabled=purgeWorkerEnabled;
        this.transactions=transactions;
    }

    public DocumentPurgeRepository.Preview preview(UUID actor,UUID resourceId) {
        access.requireActive(actor);
        var item=repository.trashItem(resourceId);
        requireTrashVisibility(actor,item);
        var evaluation=evaluate(actor,resources(item));
        return repository.preview(item,evaluation.reason().isEmpty()?"ELIGIBLE":evaluation.reason());
    }

    public String eligibilityReason(UUID actor,DocumentLibraryRepository.TrashItem item) {
        access.requireActive(actor);
        if(!actor.equals(item.spaceOwnerId())&&!access.isAdministrator(actor)) return "OUT_OF_SCOPE";
        return evaluate(actor,resources(item)).reason();
    }

    @Transactional
    public DocumentPurgeRepository.Operation request(UUID actor,UUID resourceId,String idempotencyKey) {
        access.requireActive(actor);
        validateIdempotencyKey(idempotencyKey);
        var item=repository.trashItem(resourceId);
        requireTrashVisibility(actor,item);
        var resources=resources(item);
        var evaluation=evaluate(actor,resources);
        if(evaluation.reason().isEmpty()) return repository.queueRequest(actor,idempotencyKey,"ITEM",resources,evaluation.policyId());
        String reason=evaluation.reason();
        var preview=repository.preview(item,reason);
        return repository.recordBlockedRequest(actor,idempotencyKey,item,reason,preview.itemCount(),preview.estimatedBytes());
    }

    public DocumentPurgeRepository.Progress progress(UUID actor,UUID operationId) {
        access.requireActive(actor);
        return repository.progress(operationId,actor,access.isAdministrator(actor));
    }

    @Transactional
    public EmptyPreview previewEmpty(UUID actor,int requestedLimit) {
        access.requireActive(actor);
        int limit=Math.max(1,Math.min(requestedLimit,200));
        boolean administrator=access.isAdministrator(actor);
        var selected=repository.trashItems(administrator?null:actor,administrator,limit+1);
        boolean truncated=selected.size()>limit;
        var items=selected.stream().limit(limit).map(item->{
            var evaluation=evaluate(actor,resources(item));
            return repository.preview(item,evaluation.reason().isEmpty()?"ELIGIBLE":evaluation.reason());
        }).toList();
        return new EmptyPreview(items,limit,truncated);
    }

    @Transactional
    public DocumentPurgeRepository.Operation requestEmpty(UUID actor,String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        EmptyPreview preview=previewEmpty(actor,200);
        if(preview.truncated()) throw ApiException.conflict("Lixeira excede o limite do lote; solicite prévias paginadas antes do esvaziamento");
        if(preview.items().isEmpty()) throw ApiException.conflict("A Lixeira está vazia");
        if(preview.items().stream().allMatch(item->"ELIGIBLE".equals(item.reasonCode()))) {
            var selected=repository.trashItems(access.isAdministrator(actor)?null:actor,access.isAdministrator(actor),201);
            var resources=new ArrayList<DocumentLibraryRepository.TrashItem>();
            for(var item:selected) resources.addAll(resources(item));
            var evaluation=evaluate(actor,resources);
            if(evaluation.reason().isEmpty()) return repository.queueRequest(actor,idempotencyKey,"EMPTY",resources,evaluation.policyId());
        }
        return repository.recordBlockedEmptyRequest(actor,idempotencyKey,preview.items());
    }

    private List<DocumentLibraryRepository.TrashItem> resources(DocumentLibraryRepository.TrashItem item) {
        return "FOLDER".equals(item.type())?repository.trashBatchItems(item.batchId()):List.of(item);
    }

    private Evaluation evaluate(UUID actor,List<DocumentLibraryRepository.TrashItem> items) {
        UUID policyId=null;
        for(var item:items) {
            if(!actor.equals(item.spaceOwnerId())&&!access.isAdministrator(actor)) return new Evaluation(null,"OUT_OF_SCOPE");
            boolean institutionalLibrary="INSTITUTION".equals(item.resourceOwnerKind())&&item.spaceOwnerId()==null;
            var policy=repository.policyEligibility(item,institutionalLibrary);
            String reason=capabilities.purgeDeniedReason(actor,item,policy.eligible(),purgeWorkerEnabled);
            if("POLICY_NOT_APPROVED".equals(reason)&&policy.reasonCode()!=null) reason=policy.reasonCode();
            if(!reason.isEmpty()) return new Evaluation(policy.policyId(),reason);
            if(policyId==null) policyId=policy.policyId();
            else if(!policyId.equals(policy.policyId())) return new Evaluation(null,"MIXED_POLICIES");
        }
        return new Evaluation(policyId,"");
    }

    @Scheduled(fixedDelayString="${nite.documents.purge.poll-delay-ms:30000}")
    public void discoverAutomatic() {
        if(!purgeWorkerEnabled) return;
        for(var candidate:repository.scanAutomatic(100)) {
            try {
                transactions.executeWithoutResult(status->queueAutomatic(candidate.id()));
            } catch(ApiException ignored) {
                // A blocked or concurrently changed item remains in the Lixeira for a later scan.
            }
        }
    }

    private void queueAutomatic(UUID rootId) {
        var root=repository.trashItem(rootId);
        var items=resources(root);
        UUID policyId=null;
        UUID authority=null;
        for(var item:items) {
            var policy=repository.policyEligibility(item,true);
            if(!policy.eligible()) return;
            if(policyId==null) {
                policyId=policy.policyId();
                authority=repository.policyApprover(policyId);
            } else if(!policyId.equals(policy.policyId())) return;
            if(!capabilities.automaticPurgeDeniedReason(authority,item).isEmpty()) return;
        }
        if(policyId!=null) repository.queueRequest(authority,"auto:"+root.id()+":"+root.batchId(),"AUTO",items,policyId);
    }

    private void requireTrashVisibility(UUID actor,DocumentLibraryRepository.TrashItem item) {
        if(!actor.equals(item.spaceOwnerId())&&!access.isAdministrator(actor)) throw ApiException.notFound();
    }
    private static void validateIdempotencyKey(String key) {
        if(key==null||key.isBlank()||key.length()>128) throw ApiException.invalid("Idempotency-Key obrigatório (máximo 128 caracteres)");
    }
    public record EmptyPreview(List<DocumentPurgeRepository.Preview> items,int limit,boolean truncated) {
        public EmptyPreview { items=List.copyOf(items); }
    }
    private record Evaluation(UUID policyId,String reason) {}
}
