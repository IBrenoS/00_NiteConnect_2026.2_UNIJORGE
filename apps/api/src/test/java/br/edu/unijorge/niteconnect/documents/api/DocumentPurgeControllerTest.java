package br.edu.unijorge.niteconnect.documents.api;

import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeService;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class DocumentPurgeControllerTest {
    @Test void emptyTrashRequiresExplicitConfirmationBeforeQueueing() {
        var service=mock(DocumentPurgeService.class);
        var identities=mock(IdentityDirectory.class);
        var controller=new DocumentPurgeController(service,identities);
        var jwt=Jwt.withTokenValue("controlled-test-token").header("alg","none").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        UUID actor=UUID.randomUUID();
        when(identities.member(jwt)).thenReturn(actor);
        assertThatThrownBy(()->controller.requestEmpty(jwt,"confirmed-operation",false))
                .hasMessageContaining("Confirmação explícita obrigatória");
        verifyNoInteractions(service);
        when(service.requestEmpty(actor,"confirmed-operation")).thenReturn(new DocumentPurgeRepository.Operation(
                UUID.randomUUID(),actor,"VOLUNTARY_EMPTY","PENDING",3,300,Instant.now(),null,null,null));
        controller.requestEmpty(jwt,"confirmed-operation",true);
        verify(service).requestEmpty(actor,"confirmed-operation");
    }
}
