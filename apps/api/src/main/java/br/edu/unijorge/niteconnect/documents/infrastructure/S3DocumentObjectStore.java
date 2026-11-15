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
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest;
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
    /** Non-DOCX objects use a distinct private key prefix. Old DOCX keys remain unchanged. */
    private String assetKey(UUID id) {return "assets/"+id+".bin";}
    @Override public void putAsset(UUID id,byte[] contents,String mimeType) {
        try {
            client.putObject(PutObjectRequest.builder().bucket(bucket).key(assetKey(id))
                    .contentType(mimeType).contentLength((long)contents.length).build(),RequestBody.fromBytes(contents));
        } catch(RuntimeException ex) {throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Armazenamento de arquivos indisponível");}
    }
    @Override public byte[] getAsset(UUID id) {
        try {
            byte[] bytes=client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(assetKey(id)).build()).asByteArray();
            if(bytes.length>DocxIntegrity.MAX_BYTES) throw new IllegalStateException("Arquivo excede 8 MiB");
            return bytes;
        } catch(RuntimeException ex) {throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"Arquivo indisponível");}
    }
    @Override public void deleteAssetOrphan(UUID id) {
        try {client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(assetKey(id)).build());}
        catch(RuntimeException ignored) { /* A recuperação posterior deve conciliar órfãos. */ }
    }
    @Override public void deleteOrphan(UUID objectId) {
        try { client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key(objectId)).build()); }
        catch (RuntimeException ignored) { /* orphan reconciliation is documented, never delete a referenced version */ }
    }

    /** Deletes every stored revision of an exact immutable key; errors remain retryable by the durable worker. */
    @Override public void purge(UUID objectId, boolean asset) {
        String objectKey=asset?assetKey(objectId):key(objectId);
        String keyMarker=null,versionMarker=null;
        do {
            var request=ListObjectVersionsRequest.builder().bucket(bucket).prefix(objectKey)
                    .keyMarker(keyMarker).versionIdMarker(versionMarker).build();
            var page=client.listObjectVersions(request);
            var versions=page.versions().stream().filter(v->objectKey.equals(v.key())).toList();
            var markers=page.deleteMarkers().stream().filter(v->objectKey.equals(v.key())).toList();
            for(var version:versions) client.deleteObject(DeleteObjectRequest.builder().bucket(bucket)
                    .key(objectKey).versionId(version.versionId()).build());
            for(var marker:markers) client.deleteObject(DeleteObjectRequest.builder().bucket(bucket)
                    .key(objectKey).versionId(marker.versionId()).build());
            keyMarker=page.nextKeyMarker();
            versionMarker=page.nextVersionIdMarker();
            if(!page.isTruncated()) break;
        } while(true);
        // Also handles unversioned and null-version objects and succeeds if the key is already absent.
        client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(objectKey).build());
    }
}
