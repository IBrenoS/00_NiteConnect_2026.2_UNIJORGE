package br.edu.unijorge.niteconnect.documents.domain;

import java.util.UUID;

/** Stable resource facts; owner identifiers may be redacted in grant-only projections. */
public record DocumentIdentity(UUID spaceOwnerId, String resourceOwnerKind, UUID resourceOwnerId,
                               UUID createdBy, UUID modifiedBy, UUID createdFor, String origin,
                               String protection, boolean retentionHold, String protectionReason,
                               UUID protectionSetBy, int protectionRevision) {
    public boolean protectedResource() { return retentionHold || !"NONE".equals(protection); }
    public boolean ownedAndCreatedBy(UUID actor) {
        return "MEMBER".equals(resourceOwnerKind) && actor.equals(resourceOwnerId) && actor.equals(createdBy);
    }
    public DocumentIdentity withoutOwnerIdentifier() {
        return new DocumentIdentity(spaceOwnerId,resourceOwnerKind,null,createdBy,modifiedBy,createdFor,
                origin,protection,retentionHold,protectionReason,protectionSetBy,protectionRevision);
    }
}
