package br.edu.unijorge.niteconnect.documents.application;

import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.UUID;

/** Durable one-object-at-a-time processor. It remains disabled unless explicitly enabled. */
@Service
@ConditionalOnProperty(prefix="nite.documents",name="enabled",havingValue="true")
public class DocumentPurgeWorker {
    private final DocumentPurgeRepository repository;
    private final DocumentObjectStore objectStore;
    private final boolean enabled;
    private final boolean automaticEnabled;

    public DocumentPurgeWorker(DocumentPurgeRepository repository,DocumentObjectStore objectStore,
                               @Value("${nite.documents.purge.worker-enabled:false}") boolean enabled,
                               @Value("${nite.documents.purge.automatic-enabled:false}") boolean automaticEnabled) {
        this.repository=repository;this.objectStore=objectStore;this.enabled=enabled;this.automaticEnabled=automaticEnabled;
    }

    /** Returns false when no eligible object is queued. S3 is never called inside a DB transaction. */
    public boolean runOnce(UUID operationId) {
        if(!enabled) throw new ApiException(HttpStatus.CONFLICT,"Processamento de descarte está desabilitado");
        var operation=repository.operation(operationId);
        if("AUTO".equals(operation.operationType())&&!automaticEnabled)
            throw new ApiException(HttpStatus.CONFLICT,"Processamento automático de retenção está desabilitado");
        if(!repository.hasApprovedPolicy(operationId)) throw new ApiException(HttpStatus.CONFLICT,"Não há política de retenção aprovada e vigente");
        if(!"PENDING".equals(operation.status())&&!"PARTIAL".equals(operation.status())&&!"PROCESSING".equals(operation.status()))
            throw new ApiException(HttpStatus.CONFLICT,"Operação não está disponível para processamento");
        if(!repository.operationResourcesStillEligible(operationId)) {
            repository.blockRemainingObjects(operationId,"ELIGIBILITY_CHANGED");
            return false;
        }
        repository.recoverStaleObjects(operationId,java.time.Instant.now().minus(java.time.Duration.ofMinutes(5)));
        repository.requeueResolvedReferences(operationId);
        var next=repository.claimObject(operationId);
        if(next.isEmpty()) {
            repository.finishOperationIfDone(operationId);
            return false;
        }
        var object=next.get();
        if(repository.hasExternalReference(object)) {
            repository.finishObject(object.id(),"BLOCKED_REFERENCE","REFERENCE_EXISTS");
        } else {
            try { objectStore.purge(object.objectId(),"ASSET".equals(object.storageKind())); }
            catch(RuntimeException failure) {
                // Keep only a stable code; provider messages may contain endpoint and request details.
                repository.finishObject(object.id(),"RETRY","OBJECT_STORE_FAILURE");
                repository.finishOperationIfDone(operationId);
                return true;
            }
            repository.finishObject(object.id(),"PURGED",null);
        }
        repository.finishOperationIfDone(operationId);
        return true;
    }

    @Scheduled(fixedDelayString="${nite.documents.purge.poll-delay-ms:30000}")
    public void poll() {
        if(!enabled) return;
        for(UUID operationId:repository.pendingOperations(25,automaticEnabled)) runOnce(operationId);
    }
}
