package br.edu.unijorge.niteconnect.documents.application;

import java.util.UUID;

/** Private, immutable blob keys. Access decisions always belong to the document service. */
public interface DocumentObjectStore {
    void put(UUID objectId, byte[] contents);
    byte[] get(UUID objectId);
    void deleteOrphan(UUID objectId);
}
