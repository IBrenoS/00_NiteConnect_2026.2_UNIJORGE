package br.edu.unijorge.niteconnect.documents.domain;

import java.util.Map;

/** Evaluated on each request; the client-facing projection is never an authorization token. */
public record DocumentCapabilities(int policyVersion, boolean canView, boolean canDownload, boolean canEdit,
                                   boolean canAddChild, boolean canRename, boolean canMove, boolean canCopy,
                                   boolean canShare, boolean canDeleteToTrash, boolean canRestore,
                                   boolean canPermanentlyDelete, boolean canArchiveInstitutionally,
                                   boolean canManageProtection, Map<String,String> deniedReasons) {
    public DocumentCapabilities { deniedReasons=Map.copyOf(deniedReasons); }
}
