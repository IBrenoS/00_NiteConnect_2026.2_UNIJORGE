# Document Sharing Implementation Plan

> **For agentic workers:** execute the tasks in order and keep existing uncommitted work intact.

**Goal:** Add internal, recipient-specific document and folder sharing with inherited `VIEW`/`EDIT`, without copying documents or exposing private project ancestry.

**Architecture:** Extend the existing `document_grants` ledger additively to support folder targets and explicit permissions while retaining `can_edit` for the legacy project endpoint. Centralize effective access in the document library repository/service and call it from library navigation, document core reads/writes and WOPI callbacks. Record immutable share events and expose recipient-facing virtual listing APIs.

**Tech Stack:** Java 21, Spring Boot, JdbcTemplate, PostgreSQL/Flyway, MockMvc, Testcontainers.

**Spec:** User request, “NITE Connect — Implementação do Compartilhamento Documental”.

## Global Constraints

- Keep current document IDs, revisions, S3 objects, official template distribution and frontend routes compatible.
- Grants are internal and recipient-specific; no anonymous, public or external access.
- A grant never grants archive, restore, move, permission administration or redistribution.
- Access is denied for inactive recipients and must be re-evaluated for every request and WOPI callback.
- Preserve the pre-existing uncommitted consolidation changes on `main`.

## Review Focus

- `VIEW` recipient attempts a WOPI write or lock after an earlier `EDIT` launch — re-evaluate effective permission and reject.
- Revoked/expired/inactive recipient requests a file, folder, history or WOPI token — deny immediately.
- Nested folder grant gets inherited access without parent/sibling disclosure — scope navigation to the shared root.
- Project outsider receives direct document grant — permit only that document and its own metadata/history.
- Moving content into a shared subtree expands recipient rights — reject the move unless rights are unchanged.

---

### Task 1: Additive grant and audit schema

**Files:** Create V30 migration; update migration catalog and migration tests.

- [ ] Add nullable `folder_id`, `permission` and preserve legacy `can_edit` / `document_id` rows.
- [ ] Enforce exactly one document-or-folder target; keep immutable grant history by revoking old rows and inserting replacements.
- [ ] Add indexes for active direct/folder grants and immutable share-event history.
- [ ] Test upgrade from V29 with an existing project edit grant, preserving its identity and mapping it to `EDIT`.

### Task 2: Effective authorization and share operations

**Files:** `DocumentLibraryRepository.java`, `DocumentLibraryService.java`, `DocumentCoreService.java`.

- [ ] Test `VIEW`, `EDIT`, direct plus inherited maximum permission, active recipient checks, and personal/project scope rules.
- [ ] Add create/list/update/revoke grant operations and immutable audit records.
- [ ] Revoke recipient WOPI sessions and clear affected document locks on access reduction.
- [ ] Apply permission checks to listing, reads, downloads and writes, while preserving administrator/project leadership access.

### Task 3: Recipient-facing APIs and safe hierarchy

**Files:** `DocumentLibraryController.java`, repository/service APIs, API tests.

- [ ] Add authorized share-management APIs and keyset-paginated `/shared-with-me` results.
- [ ] Add virtual folder navigation that does not return ancestors outside the shared boundary.
- [ ] Prevent movement into a location that expands an active recipient's effective access.
- [ ] Keep legacy `/edit-grants/{memberId}` behavior as a mapping to `EDIT` grant/revocation.

### Task 4: WOPI enforcement, regression tests and docs

**Files:** `DocumentWopiService.java`, document/library tests, implementation docs.

- [ ] Recheck effective `EDIT` for lock and save callbacks even when the session was launched writable.
- [ ] Test share/revoke and permission downgrade with live WOPI tokens and locks.
- [ ] Run targeted tests, migration tests, then the API verification suite.
- [ ] Document API shapes, permission matrix, remaining integration limits and update adherence matrix.
