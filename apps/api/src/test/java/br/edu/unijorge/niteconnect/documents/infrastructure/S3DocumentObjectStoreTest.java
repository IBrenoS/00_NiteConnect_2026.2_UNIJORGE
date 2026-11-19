package br.edu.unijorge.niteconnect.documents.infrastructure;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest;
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse;

import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class S3DocumentObjectStoreTest {
    @Test
    void purgesExactKeyWithoutVersionListingWhenBucketVersioningIsDisabled() {
        S3Client client = mock(S3Client.class);
        S3DocumentObjectStore store = new S3DocumentObjectStore(client, "documents", false);
        UUID objectId = UUID.randomUUID();

        store.purge(objectId, false);

        verify(client, never()).listObjectVersions(org.mockito.ArgumentMatchers.any(ListObjectVersionsRequest.class));
        verify(client).deleteObject(DeleteObjectRequest.builder()
                .bucket("documents").key("documents/" + objectId + ".docx").build());
    }

    @Test
    void purgesExactAssetKeyWithoutVersionListingWhenBucketVersioningIsDisabled() {
        S3Client client = mock(S3Client.class);
        S3DocumentObjectStore store = new S3DocumentObjectStore(client, "documents", false);
        UUID objectId = UUID.randomUUID();

        store.purge(objectId, true);

        verify(client, never()).listObjectVersions(org.mockito.ArgumentMatchers.any(ListObjectVersionsRequest.class));
        verify(client).deleteObject(DeleteObjectRequest.builder()
                .bucket("documents").key("assets/" + objectId + ".bin").build());
    }

    @Test
    void keepsVersionListingEnabledByDefaultForExistingS3Buckets() {
        S3Client client = mock(S3Client.class);
        when(client.listObjectVersions(org.mockito.ArgumentMatchers.any(ListObjectVersionsRequest.class)))
                .thenReturn(ListObjectVersionsResponse.builder().isTruncated(false).build());
        S3DocumentObjectStore store = new S3DocumentObjectStore(client, "documents");

        store.purge(UUID.randomUUID(), false);

        verify(client).listObjectVersions(org.mockito.ArgumentMatchers.any(ListObjectVersionsRequest.class));
    }
}
