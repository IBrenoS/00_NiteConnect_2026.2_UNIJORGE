package br.edu.unijorge.niteconnect.documents.infrastructure;

import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import br.edu.unijorge.niteconnect.documents.domain.DocxIntegrity;
import org.springframework.http.HttpStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import java.util.UUID;

/** No public bucket URLs, no mutable object keys and no presigned client access. */
public final class S3DocumentObjectStore implements DocumentObjectStore {
    private final S3Client client;
    private final String bucket;
    public S3DocumentObjectStore(S3Client client, String bucket) {
        this.client = client;
        this.bucket = bucket;
    }
    private String key(UUID id) { return "documents/" + id + ".docx"; }

    @Override public void put(UUID objectId, byte[] contents) {
        try {
            client.putObject(PutObjectRequest.builder().bucket(bucket).key(key(objectId))
                    .contentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                    .contentLength((long)contents.length).build(), RequestBody.fromBytes(contents));
        } catch (RuntimeException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Armazenamento documental indisponível");
        }
    }
    @Override public byte[] get(UUID objectId) {
        try {
            var bytes = client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key(objectId)).build());
            if (bytes.asByteArray().length > DocxIntegrity.MAX_BYTES) {
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Objeto documental excede limite de integridade");
            }
            return bytes.asByteArray();
        } catch (RuntimeException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Não foi possível recuperar o documento");
        }
    }
    @Override public void deleteOrphan(UUID objectId) {
        try { client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key(objectId)).build()); }
        catch (RuntimeException ignored) { /* orphan reconciliation is documented, never delete a referenced version */ }
    }
}
