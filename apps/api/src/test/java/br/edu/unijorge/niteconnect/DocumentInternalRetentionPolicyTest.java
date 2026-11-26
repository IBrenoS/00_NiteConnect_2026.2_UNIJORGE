package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.application.DocumentLibraryService;
import br.edu.unijorge.niteconnect.documents.application.DocumentProjectActionService;
import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeService;
import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeActivationService;
import br.edu.unijorge.niteconnect.documents.application.DocumentCapabilityService;
import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeWorker;
import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import br.edu.unijorge.niteconnect.documents.application.DocumentRetentionPolicyService;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import java.util.UUID;
import java.time.Instant;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class DocumentInternalRetentionPolicyTest {
    @Container static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17-alpine");

    @Test void oneInternalApprovalActivatesThirtyDayPolicyAndKeepsVersionedAudit() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID coordinator=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Coordenação','retention-test@unijorge.com.br','ATIVO')",coordinator);
        var service=new DocumentRetentionPolicyService(jdbc,mock(AccessService.class));
        int previousVersion=jdbc.queryForObject("select coalesce(max(version),0) from nite_connect.document_retention_policies where policy_key='NITE_DOCUMENTS'",Integer.class);
        int previousEvents=jdbc.queryForObject("select count(*) from nite_connect.document_retention_policy_events",Integer.class);
        var first=service.draft(coordinator,"Política interna aprovada pelo NITE");
        assertThat(first.version()).isEqualTo(previousVersion+1);
        assertThat(first.enabled()).isFalse();
        assertThat(service.approve(coordinator,first.id(),"Vigência interna autorizada").enabled()).isTrue();
        var second=service.draft(coordinator,"Nova versão documental");
        assertThat(second.version()).isEqualTo(previousVersion+2);
        assertThat(service.approve(coordinator,second.id(),"Revisão interna autorizada").enabled()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_retention_policies where enabled",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select minimum_trash_days from nite_connect.document_retention_policies where id=?",Integer.class,second.id())).isEqualTo(30);
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_retention_policy_events",Integer.class)).isEqualTo(previousEvents+(previousVersion==0?5:6));
    }

    @Test void durableAutomaticScanSelectsOnlyRootsOlderThanThirtyDays() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID member=UUID.randomUUID(),old=UUID.randomUUID(),recent=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Integrante','scan-test@unijorge.com.br','ATIVO')",member);
        insertTrashedDocument(jdbc,old,member,31);
        insertTrashedDocument(jdbc,recent,member,29);
        var identities=new DocumentIdentityRepository(jdbc);
        var repository=new DocumentPurgeRepository(jdbc,new DocumentLibraryRepository(jdbc,identities));
        assertThat(repository.scanAutomatic(100)).extracting(DocumentPurgeRepository.AutomaticCandidate::id)
                .contains(old).doesNotContain(recent);
    }
    private static void insertTrashedDocument(JdbcTemplate jdbc,UUID id,UUID member,int days) {
        jdbc.update("""
                insert into nite_connect.documents(id,title,context,owner_id,official,created_by,space_owner_id,
                  resource_owner_kind,resource_owner_id,origin,protection,lifecycle_state,deleted_at,deleted_by,trash_batch_id)
                values (?,?,'PERSONAL',?,false,?,?,'MEMBER',?,'PERSONAL_CREATED','NONE','TRASHED',
                  clock_timestamp()-make_interval(days=>?),?,?)
                """,id,"Teste "+days,member,member,member,member,days,member,UUID.randomUUID());
    }

    @Test void purgeRequestsForFolderAndDescendantReuseOneDeletionUnitOperation() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var dataSource=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());
        var jdbc=new JdbcTemplate(dataSource);
        UUID actor=UUID.randomUUID(),document=UUID.randomUUID(),version=UUID.randomUUID(),object=UUID.randomUUID(),batch=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Integrante','purge-unit-test@unijorge.com.br','ATIVO')",actor);
        var identities=new DocumentIdentityRepository(jdbc);
        var library=new DocumentLibraryRepository(jdbc,identities);
        var home=library.ensurePersonal(actor);
        var root=library.addFolder(home.id(),"Unidade de descarte","#D6A432",actor);
        jdbc.update("update nite_connect.document_folders set lifecycle_state='TRASHED',deleted_at=clock_timestamp(),deleted_by=?,trash_batch_id=? where id=?",actor,batch,root.id());
        jdbc.update("""
                insert into nite_connect.documents(id,title,context,owner_id,official,created_by,space_owner_id,resource_owner_kind,
                  resource_owner_id,origin,protection,protection_revision,folder_id,lifecycle_state,deleted_at,deleted_by,trash_batch_id)
                values (?,'Descendente.docx','PERSONAL',?,false,?,?,'MEMBER',?,'PERSONAL_CREATED','NONE',0,?,'TRASHED',clock_timestamp(),?,?)
                """,document,actor,actor,actor,actor,root.id(),actor,batch);
        jdbc.update("""
                insert into nite_connect.document_versions(id,document_id,revision,object_id,size,sha256,status,created_by)
                values (?,?,1,?,100,repeat('a',64),'AVAILABLE',?)
                """,version,document,object,actor);
        jdbc.update("update nite_connect.documents set current_version_id=? where id=?",version,document);
        var repository=new DocumentPurgeRepository(jdbc,library);
        var access=mock(AccessService.class);
        var capabilities=new DocumentCapabilityService(access,mock(ProjectAccess.class),mock(DocumentSharingRepository.class),library,identities);
        var service=new DocumentPurgeService(access,capabilities,repository,true,false,
                new TransactionTemplate(new DataSourceTransactionManager(dataSource)));

        var descendantRequest=service.request(actor,document,"purge-descendant");
        var rootRequest=service.request(actor,root.id(),"purge-root");

        assertThat(rootRequest.id()).isEqualTo(descendantRequest.id());
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_operations where actor_id=?",Integer.class,actor)).isEqualTo(1);
        assertThat(rootRequest.itemCount()).isEqualTo(2);
    }

    @Test void projectLeaderRequestsInstitutionalTrashAndOneAdministratorDecides() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID leader=UUID.randomUUID(),administrator=UUID.randomUUID(),project=UUID.randomUUID(),other=UUID.randomUUID(),document=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Líder','project-leader-test@unijorge.com.br','ATIVO')",leader);
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Gestão','project-admin-test@unijorge.com.br','ATIVO')",administrator);
        jdbc.update("insert into nite_connect.projects(id,title,description,created_by) values (?,'Projeto de teste','Projeto de teste',?)",project,leader);
        jdbc.update("insert into nite_connect.projects(id,title,description,created_by) values (?,'Outro projeto','Outro projeto',?)",other,leader);
        jdbc.update("""
                insert into nite_connect.documents(id,title,context,project_id,official,created_by,
                  resource_owner_kind,resource_owner_id,origin,protection)
                values (?,'Projeto.docx','PROJECT',?,true,?,'PROJECT',?,'PROJECT_CREATED','OFFICIAL')
                """,document,project,leader,project);
        var library=mock(DocumentLibraryService.class);
        var projects=mock(ProjectAccess.class);
        var service=new DocumentProjectActionService(jdbc,mock(AccessService.class),projects,
                new DocumentIdentityRepository(jdbc),library,mock(DocumentPurgeService.class));
        assertThatThrownBy(()->service.create(leader,other,document,"DOCUMENT","TRASH","Pedido fora de escopo"))
                .isInstanceOf(br.edu.unijorge.niteconnect.shared.api.ApiException.class);
        var request=service.create(leader,project,document,"DOCUMENT","TRASH","Material institucional do projeto");
        assertThat(request.status()).isEqualTo("PENDING");
        assertThat(service.decide(administrator,request.id(),true,"Aprovado pela gestão do NITE",true).status()).isEqualTo("APPROVED");
        verify(library).trashFile(administrator,document);
    }

    @Test void operationalReleaseRequiresEveryTechnicalCheckAndIsAuditedAndReversible() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID actor=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Gestão','activation-test@unijorge.com.br','ATIVO')",actor);
        var access=mock(AccessService.class);
        var policies=new DocumentRetentionPolicyService(jdbc,access);
        var draft=policies.draft(actor,"Nova versão de política interna");
        policies.approve(actor,draft.id(),"Homologação funcional interna");
        var activation=new DocumentPurgeActivationService(jdbc,access);
        assertThat(activation.current(actor).enabled()).isFalse();
        assertThatThrownBy(()->activation.change(actor,new DocumentPurgeActivationService.Activation(
                true,true,false,true,true,true,null,null,"Homologação incompleta")))
                .isInstanceOf(br.edu.unijorge.niteconnect.shared.api.ApiException.class);
        assertThat(activation.change(actor,new DocumentPurgeActivationService.Activation(
                true,true,true,true,true,true,null,null,"Homologação técnica em ambiente isolado")).enabled()).isTrue();
        var repository=new DocumentPurgeRepository(jdbc,mock(DocumentLibraryRepository.class));
        var recent=new DocumentLibraryRepository.TrashItem(UUID.randomUUID(),"Teste.docx","DOCUMENT",actor,actor,
                "MEMBER",actor,"Gestão",Instant.now(),actor,"Gestão",Instant.now().minusSeconds(86400),null,null,
                "PERSONAL_CREATED","NONE",false,10,0,UUID.randomUUID());
        assertThat(repository.policyEligibility(recent,false).eligible()).isTrue();
        assertThat(repository.policyEligibility(recent,true).eligible()).isFalse();
        assertThat(activation.change(actor,new DocumentPurgeActivationService.Activation(
                false,true,true,true,true,true,null,null,"Suspensão operacional")).enabled()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_activation_events",Integer.class)).isEqualTo(2);
    }

    @Test void automaticPurgeQueuesOnlyAfterThirtyDaysAndKeepsTombstone() {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var dataSource=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());
        var jdbc=new JdbcTemplate(dataSource);
        UUID actor=UUID.randomUUID(),old=UUID.randomUUID(),recent=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Gestão','auto-test@unijorge.com.br','ATIVO')",actor);
        var access=mock(AccessService.class);
        var policies=new DocumentRetentionPolicyService(jdbc,access);
        var draft=policies.draft(actor,"Política automática de 30 dias");
        policies.approve(actor,draft.id(),"Autorização interna");
        new DocumentPurgeActivationService(jdbc,access).change(actor,new DocumentPurgeActivationService.Activation(
                true,true,true,true,true,true,null,null,"Ambiente isolado de teste"));
        insertTrashedDocument(jdbc,old,actor,31);
        insertTrashedDocument(jdbc,recent,actor,29);
        var identities=new DocumentIdentityRepository(jdbc);
        var library=new DocumentLibraryRepository(jdbc,identities);
        var repository=new DocumentPurgeRepository(jdbc,library);
        var capabilities=new DocumentCapabilityService(access,mock(ProjectAccess.class),mock(DocumentSharingRepository.class),library,identities);
        var service=new DocumentPurgeService(access,capabilities,repository,true,true,new TransactionTemplate(new DataSourceTransactionManager(dataSource)));
        service.discoverAutomatic();
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,old)).isEqualTo("PURGE_PENDING");
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,recent)).isEqualTo("TRASHED");
        UUID operation=jdbc.queryForObject("select purge_operation_id from nite_connect.documents where id=?",UUID.class,old);
        assertThat(new DocumentPurgeWorker(repository,mock(DocumentObjectStore.class),true,true).runOnce(operation)).isFalse();
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,old)).isEqualTo("PURGED");
        assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_tombstones where resource_id=?",Integer.class,old)).isEqualTo(1);
        new DocumentPurgeActivationService(jdbc,access).change(actor,new DocumentPurgeActivationService.Activation(
                false,true,true,true,true,true,null,null,"Desativada para validar descarte voluntário"));
        assertThat(service.preview(actor,recent).decision()).isEqualTo("ELIGIBLE");
        var early=service.request(actor,recent,"manual-early:"+recent);
        assertThat(early.status()).isEqualTo("PENDING");
        assertThat(early.operationType()).isEqualTo("VOLUNTARY");
        assertThat(jdbc.queryForObject("select policy_id from nite_connect.document_purge_operations where id=?",UUID.class,early.id())).isNull();
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,recent)).isEqualTo("PURGE_PENDING");
        assertThat(service.request(actor,recent,"manual-early:"+recent).id()).isEqualTo(early.id());
        assertThat(new DocumentPurgeWorker(repository,mock(DocumentObjectStore.class),true,false).runOnce(early.id())).isFalse();
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,recent)).isEqualTo("PURGED");
        UUID other=UUID.randomUUID(),mine=UUID.randomUUID(),theirs=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,'Outro integrante','auto-other-test@unijorge.com.br','ATIVO')",other);
        insertTrashedDocument(jdbc,mine,actor,1);
        insertTrashedDocument(jdbc,theirs,other,1);
        org.mockito.Mockito.when(access.isAdministrator(actor)).thenReturn(true);
        var empty=service.previewEmpty(actor,100);
        assertThat(empty.items()).extracting(DocumentPurgeRepository.Preview::resourceId).contains(mine).doesNotContain(theirs);
        var emptyOperation=service.requestEmpty(actor,"empty-scope:"+actor);
        assertThat(emptyOperation.operationType()).isEqualTo("VOLUNTARY_EMPTY");
        assertThat(emptyOperation.itemCount()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,theirs)).isEqualTo("TRASHED");
    }
}
