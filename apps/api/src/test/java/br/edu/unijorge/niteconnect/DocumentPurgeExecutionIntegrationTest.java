package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeWorker;
import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeService;
import br.edu.unijorge.niteconnect.documents.application.DocumentCapabilityService;
import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentSharingRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.S3DocumentObjectStore;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

import java.net.URI;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.Mockito.mock;


@Testcontainers
class DocumentPurgeExecutionIntegrationTest {
    @Container static final PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:17-alpine");
    @Container static final GenericContainer<?> seaweed=new GenericContainer<>("chrislusf/seaweedfs:latest")
            .withEnv("AWS_ACCESS_KEY_ID","purge-test")
            .withEnv("AWS_SECRET_ACCESS_KEY","test-only-secret")
            .withEnv("S3_BUCKET","purge-test")
            .withExposedPorts(8333);

    @Test void approvedTestOperationDeletesS3BytesAndLeavesPostgresTombstoneAndVersionHistory() throws Exception {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var jdbc=new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword()));
        UUID actor=UUID.randomUUID(),document=UUID.randomUUID(),version=UUID.randomUUID(),object=UUID.randomUUID();
        UUID policy=UUID.randomUUID(),operation=UUID.randomUUID(),operationItem=UUID.randomUUID(),batch=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,?,'purge-test@unijorge.com.br','ATIVO')",actor,"Teste descarte");
        jdbc.update("""
                insert into nite_connect.document_retention_policies(id,policy_key,version,scope,minimum_trash_days,enabled,
                  approved_by,approved_at,effective_from,policy_hash,created_by)
                values (?,'NITE_DOCUMENTS',1,'GLOBAL',30,true,?,clock_timestamp(),clock_timestamp()-interval '1 day',repeat('a',64),?)
                """,policy,actor,actor);
        jdbc.update("update nite_connect.document_purge_activation set enabled=true,versioning_verified=true,backup_verified=true,reconciliation_verified=true,permissions_verified=true,recovery_verified=true,changed_by=?,changed_at=clock_timestamp(),reason='Teste isolado' where id=true",actor);
        jdbc.update("""
                insert into nite_connect.document_purge_operations(id,actor_id,operation_type,status,idempotency_key,policy_id,item_count,estimated_bytes)
                values (?,?,'ITEM','PENDING','integration-test',?,1,?)
                """,operation,actor,policy,DocxIntegrityTest.docx("Conteúdo de teste").length);
        jdbc.update("""
                insert into nite_connect.document_purge_operation_items(id,operation_id,resource_id,resource_type,state,estimated_bytes)
                values (?,?,?,'DOCUMENT','PENDING',?)
                """,operationItem,operation,document,DocxIntegrityTest.docx("Conteúdo de teste").length);
        jdbc.update("""
                insert into nite_connect.documents(id,title,context,owner_id,official,version,created_by,space_owner_id,
                  resource_owner_kind,resource_owner_id,origin,protection,protection_revision,lifecycle_state,deleted_at,deleted_by,
                  trash_batch_id,purge_operation_id)
                values (?,?,'PERSONAL',?,false,1,?,?,'MEMBER',?,'PERSONAL_CREATED','NONE',0,'PURGE_PENDING',clock_timestamp()-interval '1 day',?,?,?)
                """,document,"Apagável.docx",actor,actor,actor,actor,actor,batch,operation);
        byte[] bytes=DocxIntegrityTest.docx("Conteúdo de teste");
        jdbc.update("""
                insert into nite_connect.document_versions(id,document_id,revision,object_id,size,sha256,status,created_by)
                values (?,?,1,?,?,repeat('b',64),'AVAILABLE',?)
                """,version,document,object,bytes.length,actor);
        jdbc.update("update nite_connect.documents set current_version_id=? where id=?",version,document);
        jdbc.update("""
                insert into nite_connect.document_purge_objects(id,operation_id,operation_item_id,object_id,storage_kind,estimated_bytes,state)
                values (?,?,?,?,'DOCUMENT',?,'PENDING')
                """,UUID.randomUUID(),operation,operationItem,object,bytes.length);

        String endpoint="http://"+seaweed.getHost()+":"+seaweed.getMappedPort(8333);
        try(S3Client client=S3Client.builder().endpointOverride(URI.create(endpoint)).region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("purge-test","test-only-secret")))
                .forcePathStyle(true).build()) {
            var store=new S3DocumentObjectStore(client,"purge-test");
            store.put(object,bytes);
            var identities=new DocumentIdentityRepository(jdbc);
            var library=new DocumentLibraryRepository(jdbc,identities);
            var repository=new DocumentPurgeRepository(jdbc,library);
            assertThat(new DocumentPurgeWorker(repository,store,true,true).runOnce(operation)).isTrue();

            assertThat(catchThrowable(()->store.get(object))).isNotNull();
            assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,document)).isEqualTo("PURGED");
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_versions where id=? and object_id=?",Integer.class,version,object)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_tombstones where resource_id=? and removed_bytes=?",Integer.class,document,bytes.length)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select status from nite_connect.document_purge_operations where id=?",String.class,operation)).isEqualTo("COMPLETED");
            assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_objects where id is not null and purged_at is not null",Integer.class)).isEqualTo(1);
            var progress=repository.progress(operation,actor,false);
            assertThat(progress.purgedObjects()).isEqualTo(1);
            assertThat(progress.removedBytes()).isEqualTo(bytes.length);
            assertThat(progress.items()).hasSize(1);
            assertThat(progress.items().getFirst().decision()).isEqualTo("PURGED");
        }
    }

    @Test void voluntaryThreeItemPurgeRunsWithWorkerWithoutAutomaticRetentionAndRetriesPartialS3Failure() throws Exception {
        Flyway.configure().dataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword())
                .locations("classpath:Migrations").load().migrate();
        var dataSource=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());
        var jdbc=new JdbcTemplate(dataSource);
        UUID actor=UUID.randomUUID();
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,?,'purge-voluntary@unijorge.com.br','ATIVO')",actor,"Integrante de teste");
        var identity=new DocumentIdentityRepository(jdbc);
        var library=new DocumentLibraryRepository(jdbc,identity);
        var repository=new DocumentPurgeRepository(jdbc,library);
        var access=mock(AccessService.class);
        var capabilities=new DocumentCapabilityService(access,mock(ProjectAccess.class),mock(DocumentSharingRepository.class),library,identity);
        var service=new DocumentPurgeService(access,capabilities,repository,true,false,
                new TransactionTemplate(new DataSourceTransactionManager(dataSource)));
        var items=new ArrayList<UUID>();
        var objects=new ArrayList<UUID>();
        var versions=new ArrayList<UUID>();
        var bodies=new ArrayList<byte[]>();
        for(int index=0;index<3;index++) {
            UUID document=UUID.randomUUID(),version=UUID.randomUUID(),object=UUID.randomUUID(),batch=UUID.randomUUID();
            byte[] bytes=DocxIntegrityTest.docx("Conteúdo descartável "+index);
            jdbc.update("""
                    insert into nite_connect.documents(id,title,context,owner_id,official,version,created_by,space_owner_id,
                      resource_owner_kind,resource_owner_id,origin,protection,protection_revision,lifecycle_state,deleted_at,deleted_by,
                      trash_batch_id)
                    values (?,?,'PERSONAL',?,false,1,?,?,'MEMBER',?,'PERSONAL_CREATED','NONE',0,'TRASHED',clock_timestamp()-interval '1 day',?,?)
                    """,document,"Voluntario "+index+".docx",actor,actor,actor,actor,actor,batch);
            jdbc.update("""
                    insert into nite_connect.document_versions(id,document_id,revision,object_id,size,sha256,status,created_by)
                    values (?,?,1,?,?,repeat('c',64),'AVAILABLE',?)
                    """,version,document,object,bytes.length,actor);
            jdbc.update("update nite_connect.documents set current_version_id=? where id=?",version,document);
            items.add(document);versions.add(version);objects.add(object);bodies.add(bytes);
        }

        String endpoint="http://"+seaweed.getHost()+":"+seaweed.getMappedPort(8333);
        try(S3Client client=S3Client.builder().endpointOverride(URI.create(endpoint)).region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("purge-test","test-only-secret")))
                .forcePathStyle(true).build()) {
            var store=new S3DocumentObjectStore(client,"purge-test");
            for(int index=0;index<objects.size();index++) store.put(objects.get(index),bodies.get(index));
            AtomicInteger purgeCalls=new AtomicInteger();
            DocumentObjectStore failFirstPurge=new DocumentObjectStore() {
                @Override public void put(UUID id,byte[] value){store.put(id,value);}
                @Override public byte[] get(UUID id){return store.get(id);}
                @Override public void deleteOrphan(UUID id){store.deleteOrphan(id);}
                @Override public void purge(UUID id,boolean asset){if(purgeCalls.getAndIncrement()==0)throw new IllegalStateException("falha simulada");store.purge(id,asset);}
            };
            var worker=new DocumentPurgeWorker(repository,failFirstPurge,true,false);
            var preview=service.previewEmpty(actor,20);
            assertThat(preview.items()).hasSize(3).allSatisfy(item->assertThat(item.reasonCode()).isEqualTo("ELIGIBLE"));
            assertThat(preview.items()).allSatisfy(item->assertThat(item.estimatedBytes()).isPositive());
            var operation=service.requestEmpty(actor,"voluntary-empty:"+actor);
            assertThat(operation.operationType()).isEqualTo("VOLUNTARY_EMPTY");
            assertThat(operation.status()).isEqualTo("PENDING");
            assertThat(repository.trashItems(actor,false,20)).isEmpty();
            assertThat(service.requestEmpty(actor,"voluntary-empty:"+actor).id()).isEqualTo(operation.id());
            UUID policy=jdbc.query("select id from nite_connect.document_retention_policies where enabled and policy_key='NITE_DOCUMENTS' and minimum_trash_days=30 and approved_by is not null and effective_from<=clock_timestamp() and (effective_until is null or effective_until>clock_timestamp()) order by version desc limit 1",
                    (rs,row)->rs.getObject(1,UUID.class)).stream().findFirst().orElse(null);
            if(policy==null) {
                policy=UUID.randomUUID();
                int policyVersion=jdbc.queryForObject("select coalesce(max(version),0)+1 from nite_connect.document_retention_policies where policy_key='NITE_DOCUMENTS'",Integer.class);
                jdbc.update("""
                        insert into nite_connect.document_retention_policies(id,policy_key,version,scope,minimum_trash_days,enabled,
                          approved_by,approved_at,effective_from,policy_hash,created_by)
                        values (?,'NITE_DOCUMENTS',?,'GLOBAL',30,true,?,clock_timestamp(),clock_timestamp()-interval '1 day',repeat('d',64),?)
                        """,policy,policyVersion,actor,actor);
            }
            UUID manualOperation=UUID.randomUUID(),automaticOperation=UUID.randomUUID();
            jdbc.update("update nite_connect.document_purge_activation set enabled=true,versioning_verified=true,backup_verified=true,reconciliation_verified=true,permissions_verified=true,recovery_verified=true,changed_by=?,changed_at=clock_timestamp(),reason='Teste isolado' where id=true",actor);
            jdbc.update("""
                    insert into nite_connect.document_purge_operations(id,actor_id,operation_type,status,idempotency_key,policy_id,item_count,estimated_bytes)
                    values (?,?,'ITEM','PENDING',?,?,1,0),(?,?,'AUTO','PENDING',?,?,1,0)
                    """,manualOperation,actor,"manual-test:"+actor,policy,automaticOperation,actor,"auto-test:"+actor,policy);
            assertThat(repository.pendingOperations(25,false)).contains(operation.id(),manualOperation).doesNotContain(automaticOperation);
            assertThat(repository.pendingOperations(25,true)).contains(operation.id(),manualOperation,automaticOperation);
            worker.poll();
            assertThat(repository.progress(operation.id(),actor,false).retryingObjects()).isEqualTo(1);
            for(int attempt=0;attempt<5&&"COMPLETED".equals(repository.operation(operation.id()).status())==false;attempt++) worker.poll();

            var progress=repository.progress(operation.id(),actor,false);
            assertThat(progress.operation().status()).isEqualTo("COMPLETED");
            assertThat(progress.objectCount()).isEqualTo(3);
            assertThat(progress.purgedObjects()).isEqualTo(3);
            assertThat(progress.retryingObjects()).isZero();
            assertThat(progress.removedBytes()).isEqualTo(bodies.stream().mapToLong(bytes->bytes.length).sum());
            assertThat(purgeCalls.get()).isEqualTo(4);
            assertThat(repository.trashItems(actor,false,20)).isEmpty();
            for(int index=0;index<3;index++) {
                UUID objectId=objects.get(index);
                assertThat(jdbc.queryForObject("select lifecycle_state from nite_connect.documents where id=?",String.class,items.get(index))).isEqualTo("PURGED");
                assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_versions where id=?",Integer.class,versions.get(index))).isEqualTo(1);
                assertThat(jdbc.queryForObject("select count(*) from nite_connect.document_purge_tombstones where resource_id=?",Integer.class,items.get(index))).isEqualTo(1);
                assertThat(catchThrowable(()->store.get(objectId))).isNotNull();
            }
            assertThat(service.requestEmpty(actor,"voluntary-empty:"+actor).id()).isEqualTo(operation.id());
            assertThat(catchThrowable(()->worker.runOnce(operation.id()))).isNotNull();
            assertThat(purgeCalls.get()).isEqualTo(4);
        }
    }
}
