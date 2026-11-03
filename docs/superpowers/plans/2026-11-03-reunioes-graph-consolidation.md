# Reuniões Graph Consolidation Implementation Plan

> **For agentic workers:** execute this plan task-by-task, verifying each behavioral change before proceeding. Do not commit; the user requested no commit, merge, reset, or push.

**Goal:** Make Microsoft Graph the only creation provider exposed by the primary Reuniões experience, keep historical `TEAMS_LINK` records readable, show truthful capability/consent states, and separate cancelled records from future/past lists.

**Architecture:** Keep the existing delegated OBO + Graph Calendar provider and Entra login contract. Probe `/api/v1/meetings/calendar/capabilities` once per browser session and cache only the capability result, never credentials. Keep all API bearer use in server actions. Add an additive `cancelled` scope to the meetings list; do not add completion states or migrations. Legacy `TEAMS_LINK` items stay read-only in the interface, with previously confirmed links still entering through the authenticated NITE route.

**Tech Stack:** Spring Boot 4 / Java 21 / PostgreSQL / Flyway; Next.js 16 App Router / React / strict TypeScript / Vitest.

### Task 1: Correct meeting lifecycle list contract

**Files:** `MeetingService.java`, `MeetingRepository.java`, `MeetingCreationTest.java`, `docs/implementation/reunioes-backend.md`.

1. Add an integration test proving a cancelled future Graph meeting is absent from `upcoming` and returned only by `cancelled`.
2. Run the focused test and confirm it fails because the scope is not supported and cancelled records are included in future/past SQL.
3. Validate the additive `cancelled` scope and build explicit status/date predicates for `upcoming`, `past`, and `cancelled`; include recoverable pending statuses in date-scoped lists and exclude cancelled records from them.
4. Run the focused meeting integration test.

### Task 2: Graph availability and safe operation gating

**Files:** meeting web contracts/data/actions/mutations, `MeetingsWorkspace`, `MeetingEditorDialog`, tests.

1. Add tests for mapping `OBO_CONSENT_REQUIRED`, disabled/misconfigured Graph, unsupported Teams calendar, transient failures, and session capability-cache expiry.
2. Verify the tests fail before the mapper/cache exists.
3. Add a capability server action using the existing authenticated session and endpoint. Parse only safe NITE problem codes; never expose Microsoft response bodies.
4. Cache capability status only in browser session storage for a short bounded interval, keyed by NITE member ID; include a deliberate recheck action. Do not store tokens or bearer assertions.
5. Gate Graph create/edit/cancel forms before data entry. Keep existing list, detail, invite response, notification, share, and confirmed-link entry available when Graph is unavailable.
6. Use `GRAPH` for all new frontend creation commands. Keep Graph idempotency keys stable while the same form payload is retried.
7. Run targeted web tests, lint, and typecheck.

### Task 3: Graph-first meeting experience and legacy read compatibility

**Files:** `MeetingsWorkspace`, `MeetingEditorDialog`, preview fixtures/page, meeting tests.

1. Remove the legacy manual continuation/link form and related primary actions from user-facing UI.
2. Render `TEAMS_LINK` records as historical data: retain details, internal invite responses, authorized entry when a valid link exists, and NITE sharing; expose no manual create/link/edit/cancel actions.
3. Display internal invite response without implying Outlook synchronization.
4. Add a separate compact cancelled-meetings section and keep past dates distinct from completion evidence.
5. Remove interactive attendance-report retrieval from the primary UI while additional Graph artifact consent is absent; show actual duration only when the backend already supplies it.
6. Keep date/time/frequency views in `America/Bahia`; no new completion state or B04 writes.
7. Validate with explicitly synthetic preview states in light/dark and mobile/desktop.

### Task 4: Documentation and final verification

**Files:** `docs/implementation/reunioes-backend.md`, optionally a focused Graph authorization runbook.

1. Document the current Graph-first frontend/API flow, additive cancelled scope, missing-consent behavior, short capability-cache policy, and legacy compatibility.
2. Add a stepwise institutional readiness procedure for consented OBO, calendar capability query, create/schedule/update/cancel and Teams/Outlook checks. State that real Graph is not verified until the tenant returns successful delegated Graph responses.
3. Run `mvn verify`, `npm run check`, and `git diff --check`.
4. Capture synthetic UI states and report separately any authenticated or real-tenant checks blocked by `AADSTS65001`.
5. Confirm branch and worktree status, preserving all existing uncommitted work; do not commit.
