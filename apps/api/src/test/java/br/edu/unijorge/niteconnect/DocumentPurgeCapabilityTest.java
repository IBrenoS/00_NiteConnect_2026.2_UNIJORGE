package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.application.DocumentCapabilityService;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class DocumentPurgeCapabilityTest {
    private final AccessService access=mock(AccessService.class);
    private final DocumentCapabilityService capabilities=new DocumentCapabilityService(access,mock(ProjectAccess.class),
            mock(DocumentSharingRepository.class),mock(DocumentLibraryRepository.class),mock(DocumentIdentityRepository.class));
    private static final UUID owner=UUID.fromString("10000000-0000-4000-8000-000000000001");

    @BeforeEach void activeMember() { when(access.isAdministrator(owner)).thenReturn(false); }

    @Test void createdPersonalContentStillCannotPurgeWithoutAnApprovedPolicyAndEnabledWorker() {
        var item=item(owner,"MEMBER","NONE",false);
        assertThat(capabilities.purgeDeniedReason(owner,item,false,false)).isEqualTo("POLICY_NOT_APPROVED");
        assertThat(capabilities.purgeDeniedReason(owner,item,true,false)).isEqualTo("PROCESSING_DISABLED");
        assertThat(capabilities.purgeDeniedReason(owner,item,true,true)).isEmpty();
    }

    @Test void authorAndSpaceHolderMustMatchForPersonalPurge() {
        assertThat(capabilities.purgeDeniedReason(owner,item(UUID.randomUUID(),"MEMBER","NONE",false),true,true))
                .isEqualTo("OUT_OF_SCOPE");
    }

    @Test void voluntaryPersonalPurgeDoesNotDependOnRetentionPolicyOrOperationalRelease() {
        var item=item(owner,"MEMBER","NONE",false);
        assertThat(capabilities.purgeDeniedReason(owner,item,true,true,true)).isEmpty();
        assertThat(capabilities.purgeDeniedReason(owner,item,true,false,true)).isEqualTo("PROCESSING_DISABLED");
        assertThat(capabilities.purgeDeniedReason(owner,item(owner,"MEMBER","OFFICIAL",false),true,true,true))
                .isEqualTo("OUT_OF_SCOPE");
        assertThat(capabilities.purgeDeniedReason(owner,item(owner,"MEMBER","NONE",true),true,true,true))
                .isEqualTo("HOLD");
    }

    @Test void administratorMayPurgeIdentifiedInstitutionalContentButCannotOverrideHold() {
        when(access.isAdministrator(owner)).thenReturn(true);
        assertThat(capabilities.purgeDeniedReason(owner,item(owner,"INSTITUTION","OFFICIAL",false),true,true))
                .isEmpty();
        assertThat(capabilities.purgeDeniedReason(owner,item(owner,"INSTITUTION","ACADEMIC_NITE",false),true,true))
                .isEmpty();
        assertThat(capabilities.purgeDeniedReason(owner,item(owner,"MEMBER","NONE",true),true,true))
                .isEqualTo("HOLD");
    }

    @Test void unknownLegacyOwnershipFailsClosed() {
        assertThat(capabilities.purgeDeniedReason(owner,item(owner,"UNKNOWN","UNKNOWN",false),true,true))
                .isEqualTo("OWNER_UNKNOWN");
    }

    private static DocumentLibraryRepository.TrashItem item(UUID creator,String ownerKind,String protection,boolean hold) {
        return new DocumentLibraryRepository.TrashItem(UUID.randomUUID(),"Relatório", "DOCUMENT", owner,
                UUID.randomUUID(),ownerKind,creator,"Criador",Instant.now(),UUID.randomUUID(),"Excluidor",Instant.now(),UUID.randomUUID(),"Pasta",
                "PERSONAL_CREATED",protection,hold,256,0,UUID.randomUUID());
    }
}
