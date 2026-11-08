package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.documents.infrastructure.S3DocumentObjectStore;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import java.net.URI;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

/** Real S3 protocol contract against a single-node SeaweedFS instance. Requires Docker. */
@Testcontainers
class DocumentS3IntegrationTest {
    @Container
    static final GenericContainer<?> seaweed=new GenericContainer<>("chrislusf/seaweedfs:latest")
            .withEnv("AWS_ACCESS_KEY_ID","document-test")
            .withEnv("AWS_SECRET_ACCESS_KEY","not-for-production")
            .withEnv("S3_BUCKET","documents-test")
            .withExposedPorts(8333);

    @Test void immutableObjectWriteAndReadWorkWithPrivateS3Credentials() throws Exception {
        String endpoint="http://"+seaweed.getHost()+":"+seaweed.getMappedPort(8333);
        try(S3Client client=S3Client.builder().endpointOverride(URI.create(endpoint))
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("document-test","not-for-production")))
                .forcePathStyle(true).build()) {
            var store=new S3DocumentObjectStore(client,"documents-test");
            byte[] first=DocxIntegrityTest.docx("Relatório de teste");
            byte[] second=DocxIntegrityTest.docx("Relatório editado");
            UUID id1=UUID.randomUUID(),id2=UUID.randomUUID();
            store.put(id1,first);
            store.put(id2,second);
            assertThat(store.get(id1)).isEqualTo(first);
            assertThat(store.get(id2)).isEqualTo(second);
            store.deleteOrphan(id2);
            assertThat(store.get(id1)).isEqualTo(first);
        }
    }
}
