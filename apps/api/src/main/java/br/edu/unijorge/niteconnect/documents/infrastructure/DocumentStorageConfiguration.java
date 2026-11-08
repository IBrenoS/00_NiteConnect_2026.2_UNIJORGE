package br.edu.unijorge.niteconnect.documents.infrastructure;

import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import java.net.URI;

@Configuration
@ConditionalOnProperty(prefix="nite.documents.storage", name="provider", havingValue="s3")
public class DocumentStorageConfiguration {
    @Bean(destroyMethod="close")
    S3Client documentS3Client(@Value("${nite.documents.storage.endpoint}") String endpoint,
                             @Value("${nite.documents.storage.access-key}") String key,
                             @Value("${nite.documents.storage.secret-key}") String secret,
                             @Value("${nite.documents.storage.region:us-east-1}") String region) {
        if (key.isBlank() || secret.isBlank()) throw new IllegalStateException("Credenciais privadas S3 são obrigatórias");
        return S3Client.builder().endpointOverride(URI.create(endpoint))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(key, secret)))
                .region(Region.of(region)).forcePathStyle(true).build();
    }
    @Bean
    DocumentObjectStore documentObjectStore(S3Client documentS3Client,
                                            @Value("${nite.documents.storage.bucket}") String bucket) {
        return new S3DocumentObjectStore(documentS3Client, bucket);
    }
}
