package br.edu.unijorge.niteconnect.documents.application;

import java.util.UUID;

/** Private, immutable blob keys. Access decisions always belong to the document service. */
public interface DocumentObjectStore {
    void put(UUID objectId, byte[] contents);
    byte[] get(UUID objectId);
    void deleteOrphan(UUID objectId);
    /** Irreversible deletion is separate from upload compensation and must fail visibly. */
    default void purge(UUID objectId, boolean asset) {
        throw new UnsupportedOperationException("Permanent purge is not supported by this object store");
    }
    default void putAsset(UUID id,byte[] data,String mimeType) {put(id,data);}
    default byte[] getAsset(UUID id) {return get(id);}
    default void deleteAssetOrphan(UUID id) {deleteOrphan(id);}
}
