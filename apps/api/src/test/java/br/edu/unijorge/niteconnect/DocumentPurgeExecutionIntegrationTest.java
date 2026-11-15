package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.application.DocumentPurgeWorker;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentIdentityRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentLibraryRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.DocumentPurgeRepository;
import br.edu.unijorge.niteconnect.documents.infrastructure.S3DocumentObjectStore;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

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
            assertThat(new DocumentPurgeWorker(repository,store,true).runOnce(operation)).isTrue();

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
}
