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
    private final boolean automaticPurgeEnabled;
    private final TransactionTemplate transactions;

    public DocumentPurgeService(AccessService access,DocumentCapabilityService capabilities,DocumentPurgeRepository repository,
                                @Value("${nite.documents.purge.worker-enabled:false}") boolean purgeWorkerEnabled,
                                @Value("${nite.documents.purge.automatic-enabled:false}") boolean automaticPurgeEnabled,
                                TransactionTemplate transactions) {
        this.access=access;this.capabilities=capabilities;this.repository=repository;this.purgeWorkerEnabled=purgeWorkerEnabled;
        this.automaticPurgeEnabled=automaticPurgeEnabled;this.transactions=transactions;
    }

    public DocumentPurgeRepository.Preview preview(UUID actor,UUID resourceId) {
        access.requireActive(actor);
        var item=unitRoot(repository.trashItem(resourceId));
        requireTrashVisibility(actor,item);
        var evaluation=evaluate(actor,resources(item));
        return repository.preview(item,evaluation.reason().isEmpty()?"ELIGIBLE":evaluation.reason());
    }

    public String eligibilityReason(UUID actor,DocumentLibraryRepository.TrashItem item) {
        access.requireActive(actor);
        item=unitRoot(item);
        if(!actor.equals(item.spaceOwnerId())&&!access.isAdministrator(actor)) return "OUT_OF_SCOPE";
        return evaluate(actor,resources(item)).reason();
    }

    @Transactional
    public DocumentPurgeRepository.Operation request(UUID actor,UUID resourceId,String idempotencyKey) {
        access.requireActive(actor);
        validateIdempotencyKey(idempotencyKey);
        var previous=repository.existingRequest(actor,idempotencyKey);
        if(previous.isPresent()) {
            var operation=previous.get();
            if(!List.of("ITEM","VOLUNTARY").contains(operation.operationType())
                    ||!repository.operationContains(operation.id(),resourceId,"DOCUMENT","FOLDER"))
                throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            return operation;
        }
        var inFlight=repository.inFlightRequest(actor,resourceId);
        if(inFlight.isPresent()) return inFlight.get();
        var item=unitRoot(repository.trashItem(resourceId));
        requireTrashVisibility(actor,item);
        var resources=resources(item);
        var evaluation=evaluate(actor,resources);
        if(evaluation.reason().isEmpty()) return repository.queueRequest(actor,idempotencyKey,
                evaluation.voluntaryPersonal()?"VOLUNTARY":"ITEM",resources,evaluation.policyId());
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
        var selected=repository.trashItems(actor,false,limit+1);
        boolean truncated=selected.size()>limit;
        var items=selected.stream().limit(limit).map(item->{
            var evaluation=evaluate(actor,resources(item));
            return repository.preview(item,evaluation.reason().isEmpty()?"ELIGIBLE":evaluation.reason());
        }).toList();
        return new EmptyPreview(items,limit,truncated);
    }

    @Transactional
    public DocumentPurgeRepository.Operation requestEmpty(UUID actor,String idempotencyKey) {
        access.requireActive(actor);
        validateIdempotencyKey(idempotencyKey);
        var previous=repository.existingRequest(actor,idempotencyKey);
        if(previous.isPresent()) {
            if(!List.of("EMPTY","VOLUNTARY_EMPTY").contains(previous.get().operationType()))
                throw ApiException.conflict("Chave de idempotência já utilizada em outra solicitação");
            return previous.get();
        }
        EmptyPreview preview=previewEmpty(actor,200);
        if(preview.truncated()) throw ApiException.conflict("Lixeira excede o limite do lote; solicite prévias paginadas antes do esvaziamento");
        if(preview.items().isEmpty()) throw ApiException.conflict("A Lixeira está vazia");
        if(preview.items().stream().allMatch(item->"ELIGIBLE".equals(item.reasonCode()))) {
            var selected=repository.trashItems(actor,false,201);
            var resources=new ArrayList<DocumentLibraryRepository.TrashItem>();
            for(var item:selected) resources.addAll(resources(item));
            var evaluation=evaluate(actor,resources);
            if(evaluation.reason().isEmpty()) return repository.queueRequest(actor,idempotencyKey,
                    evaluation.voluntaryPersonal()?"VOLUNTARY_EMPTY":"EMPTY",resources,evaluation.policyId());
        }
        return repository.recordBlockedEmptyRequest(actor,idempotencyKey,preview.items());
    }

    private DocumentLibraryRepository.TrashItem unitRoot(DocumentLibraryRepository.TrashItem item) {
        UUID root=repository.trashBatchRoot(item.batchId());
        return root==null?item:repository.trashItem(root);
    }
    private List<DocumentLibraryRepository.TrashItem> resources(DocumentLibraryRepository.TrashItem item) {
        return repository.trashBatchRoot(item.batchId())==null?List.of(item):repository.trashBatchItems(item.batchId());
    }

    private Evaluation evaluate(UUID actor,List<DocumentLibraryRepository.TrashItem> items) {
        UUID policyId=null;
        Boolean voluntaryPersonal=null;
        for(var item:items) {
            if(!actor.equals(item.spaceOwnerId())&&!access.isAdministrator(actor)) return new Evaluation(null,"OUT_OF_SCOPE");
            boolean personal=actor.equals(item.spaceOwnerId())&&actor.equals(item.createdBy())
                    &&"MEMBER".equals(item.resourceOwnerKind())&&"NONE".equals(item.protection());
            if(voluntaryPersonal!=null&&voluntaryPersonal!=personal) return new Evaluation(null,"MIXED_POLICIES");
            voluntaryPersonal=personal;
            var policy=personal?repository.voluntaryPersonalEligibility(item):repository.policyEligibility(item,true);
            String reason=capabilities.purgeDeniedReason(actor,item,policy.eligible(),purgeWorkerEnabled,personal);
            if("POLICY_NOT_APPROVED".equals(reason)&&policy.reasonCode()!=null) reason=policy.reasonCode();
            if(!reason.isEmpty()) return new Evaluation(policy.policyId(),reason);
            if(policyId==null) policyId=policy.policyId();
            else if(!policyId.equals(policy.policyId())) return new Evaluation(null,"MIXED_POLICIES");
        }
        return new Evaluation(policyId,"",Boolean.TRUE.equals(voluntaryPersonal));
    }

    @Scheduled(fixedDelayString="${nite.documents.purge.poll-delay-ms:30000}")
    public void discoverAutomatic() {
        if(!purgeWorkerEnabled||!automaticPurgeEnabled) return;
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
    private record Evaluation(UUID policyId,String reason,boolean voluntaryPersonal) {
        private Evaluation(UUID policyId,String reason) { this(policyId,reason,false); }
    }
}
