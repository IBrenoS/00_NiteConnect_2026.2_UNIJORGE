package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeWorker;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class DocumentPurgeWorkerTest {
    private final DocumentPurgeRepository repository=mock(DocumentPurgeRepository.class);
    private final DocumentObjectStore store=mock(DocumentObjectStore.class);
    private final UUID operationId=UUID.randomUUID();

    @Test void workerIsFailClosedByDefaultAndDoesNotReadOrDeleteObjects() {
        var worker=new DocumentPurgeWorker(repository,store,false,false);
        assertThatThrownBy(()->worker.runOnce(operationId)).hasMessageContaining("desabilitado");
        verifyNoInteractions(repository,store);
    }

    @Test void workerRequiresAnApprovedEffectivePolicyBeforeClaimingWork() {
        when(repository.operation(operationId)).thenReturn(new DocumentPurgeRepository.Operation(operationId,UUID.randomUUID(),"ITEM","PENDING",1,100,Instant.now(),null,null,null));
        when(repository.hasApprovedPolicy(operationId)).thenReturn(false);
        var worker=new DocumentPurgeWorker(repository,store,true,false);
        assertThatThrownBy(()->worker.runOnce(operationId)).hasMessageContaining("política");
        verify(repository,never()).claimObject(operationId);
        verifyNoInteractions(store);
    }

    @Test void automaticRetentionCannotRunWhenOnlyTheManualWorkerIsEnabled() {
        when(repository.operation(operationId)).thenReturn(new DocumentPurgeRepository.Operation(operationId,UUID.randomUUID(),"AUTO","PENDING",1,100,Instant.now(),null,null,null));
        assertThatThrownBy(()->new DocumentPurgeWorker(repository,store,true,false).runOnce(operationId))
                .hasMessageContaining("automático");
        verify(repository,never()).hasApprovedPolicy(operationId);
        verifyNoInteractions(store);
    }

    @Test void workerPurgesOneObjectThenPersistsProgressOutsideTheS3Call() {
        var object=new DocumentPurgeRepository.PurgeObject(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"DOCUMENT");
        when(repository.hasApprovedPolicy(operationId)).thenReturn(true);
        when(repository.operationResourcesStillEligible(operationId)).thenReturn(true);
        when(repository.operation(operationId)).thenReturn(operation("PENDING"));
        when(repository.claimObject(operationId)).thenReturn(Optional.of(object));
        when(repository.hasExternalReference(object)).thenReturn(false);

        assertThat(new DocumentPurgeWorker(repository,store,true,false).runOnce(operationId)).isTrue();

        verify(store).purge(object.objectId(),false);
        verify(repository).finishObject(object.id(),"PURGED",null);
        verify(repository).finishOperationIfDone(operationId);
    }

    @Test void providerFailureLeavesAStableRetryCode() {
        var object=new DocumentPurgeRepository.PurgeObject(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"ASSET");
        when(repository.hasApprovedPolicy(operationId)).thenReturn(true);
        when(repository.operationResourcesStillEligible(operationId)).thenReturn(true);
        when(repository.operation(operationId)).thenReturn(operation("PENDING"));
        when(repository.claimObject(operationId)).thenReturn(Optional.of(object));
        when(repository.hasExternalReference(object)).thenReturn(false);
        doThrow(new IllegalStateException("endpoint details must not escape")).when(store).purge(object.objectId(),true);

        new DocumentPurgeWorker(repository,store,true,false).runOnce(operationId);

        verify(repository).finishObject(object.id(),"RETRY","OBJECT_STORE_FAILURE");
        verify(repository).finishOperationIfDone(operationId);
    }

    @Test void sharedObjectIsNeverRemoved() {
        var object=new DocumentPurgeRepository.PurgeObject(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"DOCUMENT");
        when(repository.hasApprovedPolicy(operationId)).thenReturn(true);
        when(repository.operationResourcesStillEligible(operationId)).thenReturn(true);
        when(repository.operation(operationId)).thenReturn(operation("PENDING"));
        when(repository.claimObject(operationId)).thenReturn(Optional.of(object));
        when(repository.hasExternalReference(object)).thenReturn(true);

        new DocumentPurgeWorker(repository,store,true,false).runOnce(operationId);

        verify(repository).finishObject(object.id(),"BLOCKED_REFERENCE","REFERENCE_EXISTS");
        verifyNoInteractions(store);
    }

    private static DocumentPurgeRepository.Operation operation(String state) {
        return new DocumentPurgeRepository.Operation(UUID.randomUUID(),UUID.randomUUID(),"ITEM",state,1,100,
                Instant.now(),null,null,null);
    }
}
