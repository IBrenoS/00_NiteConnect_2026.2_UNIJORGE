# Reuniões Graph 403 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Implement the authenticated, responsive Microsoft Graph 403 page and route only actions blocked by a confirmed `403 OBO_CONSENT_REQUIRED` to it.

**Architecture:** Add `/reunioes/erro-403` outside the shared authenticated shell, guarded by `requireAuthenticatedNiteSession()` and themed by the root layout. Reuse the existing server-side capabilities request, preserve its real response code, and share the five-minute browser cache between the Reuniões workspace and page. Build the page with HTML/CSS and inline SVG.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, CSS Modules, Vitest, Playwright CLI for visual review.

**Spec:** `docs/superpowers/specs/2026-11-03-reunioes-graph-403-design.md`

## Global Constraints

- The API bearer is read and used only on the server through the authenticated NITE session.
- Only HTTP 403 with code `OBO_CONSENT_REQUIRED` represents this page.
- A successful capabilities response is accepted only when its full payload is valid and `supportsTeamsForBusiness` is `true`.
- Session availability cache expires after five minutes; explicit recheck bypasses and updates it.
- Recheck performs no meeting or calendar mutation and must distinguish consent, session, configuration, and temporary failure states.
- Never render the reference image as a background or substitute for interface elements.
- Preserve existing meeting history, invite responses, entry, sharing, B03, B04, B06, and Graph/OBO implementation outside the explicit OBO CTA gate.
- Do not alter Entra permissions/credentials, backend schema, infrastructure, or public meeting persistence contracts.
- Do not commit, merge, reset, or push. Keep all pre-existing work intact.
- Validate responsive layouts at 320, 360, 768, 1024, and 1440 px in Light and Dark.

## Review Focus

1. HTTP 200 with malformed capabilities or `supportsTeamsForBusiness: false` must never be treated as connected; pin in Task 1 contract tests and Task 3 CTA tests.
2. `OBO_ADMIN_APPROVAL_REQUIRED`, unrelated 403 codes, and network errors must not route to this 403; pin exact-code mapping in Task 1 and routing tests in Task 3.
3. An explicit check must bypass a still-fresh five-minute cache and replace its value; pin in Task 1 cache tests and Task 2 recheck tests.
4. Direct route access and repeated clicks must not show a fabricated code, create duplicate checks, or hang beyond the timeout; pin page and action behavior in Task 2 tests.
5. Historical join/share behavior must remain contract-driven outside the explicit OBO gate; pin CTA routing and real error feedback in Task 3 tests.

---

### Task 1: Preserve exact capabilities state and cache it safely

**Files:**
- Modify: `apps/web/src/lib/meetings/contracts.ts`
- Modify: `apps/web/src/lib/meetings/contracts.test.ts`
- Modify: `apps/web/src/lib/meetings/actions.ts`
- Create: `apps/web/src/lib/meetings/graph-availability-cache.ts`
- Create: `apps/web/src/lib/meetings/graph-availability-cache.test.ts`

**Interfaces:**
- Produce `MeetingGraphAvailabilityResult = { state: Exclude<MeetingGraphAvailability, "checking">; httpStatus: number | null; code: string | null }`.
- Change `resolveMeetingGraphAvailability(status: number, payload: unknown): MeetingGraphAvailabilityResult` to require the complete capability DTO on success and distinguish exact OBO consent from admin approval and other errors.
- Produce `isMeetingGraphConsentRequired(result: MeetingGraphAvailabilityResult): boolean`, true only for status 403, state `consent-required`, and exact code `OBO_CONSENT_REQUIRED`.
- Produce cache read/write helpers keyed by viewer ID with a five-minute TTL; helpers accept a minimal `Storage` interface so tests can use a controlled adapter.
- Change `getMeetingGraphAvailabilityAction(): Promise<MeetingGraphAvailabilityResult>` to retain only safe status/code/state information, with no provider body or bearer returned.

- [x] **Step 1: Add failing contract tests** for valid available capabilities, valid but unsupported Teams, malformed HTTP 200 payload, exact OBO consent, admin approval, unrelated 403, 401, and 503.
- [x] **Step 2: Run the focused contract test** with `npm test -- src/lib/meetings/contracts.test.ts` and confirm new assertions fail.
- [x] **Step 3: Add failing cache tests** for viewer-key isolation, expiration at five minutes, malformed storage values, and replacing a prior consent result.
- [x] **Step 4: Run the focused cache test** with `npm test -- src/lib/meetings/graph-availability-cache.test.ts` and confirm it fails before implementation.
- [x] **Step 5: Implement the result resolver and cache helpers** with strict runtime validation and no unsafe casts.
- [x] **Step 6: Update the server action** to return the typed result from the authenticated no-store capabilities request and preserve its 15-second timeout.
- [x] **Step 7: Run both focused test files** and confirm all exact-code, malformed-response, and TTL assertions pass.

### Task 2: Build the isolated authenticated 403 page

**Files:**
- Create: `apps/web/src/app/reunioes/erro-403/page.tsx`
- Create: `apps/web/src/components/meetings/graph-authorization-page.tsx`
- Create: `apps/web/src/components/meetings/graph-authorization-view.tsx`
- Create: `apps/web/src/components/meetings/graph-authorization-illustration.tsx`
- Create: `apps/web/src/components/meetings/graph-authorization.module.css`
- Create: `apps/web/src/components/meetings/graph-authorization-view.test.tsx`
- Create: `apps/web/src/app/dev-preview/reunioes-403/page.tsx`

**Interfaces:**
- Route page calls `requireAuthenticatedNiteSession()` on the server and passes only `viewerId` to `GraphAuthorizationPage`.
- `GraphAuthorizationPage({ viewerId }: { viewerId: string })` fetches current capabilities on entry; it renders the 403 only for `isMeetingGraphConsentRequired(result)`, writes each result to the shared cache, and returns to `/reunioes` for any other state.
- `GraphAuthorizationView` receives typed state, status text, pending flag, and callbacks; production and development preview share the exact visual markup.
- `GraphAuthorizationIllustration` renders a labelled vector camera, interrupted connector/X, and globe/Microsoft mark. Desktop and mobile geometry remain vector and uncropped.

- [ ] **Step 1: Add failing view and state tests** for checking feedback, exact 403 identification, no technical code for other states, persistent-consent feedback, and success/error status copy.
- [ ] **Step 2: Run the focused view tests** with `npm test -- src/components/meetings/graph-authorization-view.test.tsx` and confirm new assertions fail.
- [ ] **Step 3: Implement the protected route** outside `(authenticated)` so it bypasses the sidebar but reuses the existing session guard and root theme provider.
- [ ] **Step 4: Implement direct-route verification and recheck** using the server action and shared cache; use an in-flight ref plus disabled pending state, retain the 15-second timeout, and distinguish pending authorization from temporary unavailability.
- [ ] **Step 5: Build the visual composition** with the exact approved Portuguese copy, responsive SVG, Light/Dark CSS, keyboard focus, touch targets, and reduced-motion support.
- [ ] **Step 6: Add a synthetic development preview** that renders the shared view and simulates a pending recheck without API or tenant access.
- [ ] **Step 7: Run focused view/state tests** and confirm the route displays 403 only after the exact current API error.

### Task 3: Route only confirmed OBO actions to the page

**Files:**
- Modify: `apps/web/src/components/meetings/meetings-workspace.tsx`
- Modify: `apps/web/src/components/meetings/meeting-editor-dialog.tsx`
- Modify: `apps/web/src/lib/meetings/mutations.ts`
- Modify: `apps/web/src/lib/meetings/actions.ts`
- Modify: `apps/web/src/app/(authenticated)/reunioes/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/reunioes/[meetingId]/entrar/route.ts`
- Add or modify: focused meeting workspace/action/route tests at the matching source paths.

**Interfaces:**
- Workspace consumes `MeetingGraphAvailabilityResult`, reads/writes the shared five-minute cache, and gates Iniciar, Agendar, list/detail Teams entry, and WhatsApp share only through `isMeetingGraphConsentRequired`.
- On an exact create/update or share error code `OBO_CONSENT_REQUIRED`, expose `consent-required`; classify admin approval separately and preserve other real errors.
- The join redirect route detects `OBO_CONSENT_REQUIRED` only from a real problem response; generic 401/403 remains the existing access error.
- Reuniões page accepts only known join feedback query values so forbidden, not-found, and unavailable results are visible without being mislabeled 403.

- [ ] **Step 1: Add failing tests** for all four CTA gates on exact OBO, normal navigation when available or when the error is unrelated, exact create/share error classification, and join feedback mapping.
- [ ] **Step 2: Run the focused meeting tests** and confirm the new routing and error-message assertions fail.
- [ ] **Step 3: Integrate shared availability state** into the workspace, preserving preview mode, history, details, invite responses, and the existing recheck behavior.
- [ ] **Step 4: Route confirmed OBO responses** from create and join/share paths to the 403 page; retain generic access/network/not-found handling.
- [ ] **Step 5: Add an explicit OBO-safe CTA flow** so Enter and WhatsApp do not start their original action when capabilities already confirmed consent is missing.
- [ ] **Step 6: Run the focused meeting tests** and confirm no meeting creation occurs during a capability check and historical actions still follow their real contracts outside the exact OBO gate.

### Task 4: Visual review and final validation

**Files:**
- Create screenshots under: `apps/web/output/playwright/reunioes-graph-403-20261103/`

- [ ] **Step 1: Start the web app with the repository's current local configuration** and use `/dev-preview/reunioes-403` for screenshots/interaction checks; do not use real tenant credentials as a synthetic test.
- [ ] **Step 2: Capture Light and Dark** at 320, 360, 768, 1024, and 1440 px.
- [ ] **Step 3: Compare captures with the supplied image** for hierarchy, SVG proportion, line interruption, whitespace, typography, buttons, brand, overflow, and focus.
- [ ] **Step 4: Run `npm run lint` and `npm run typecheck`** in `apps/web`.
- [ ] **Step 5: Run `npm run test` and `npm run build`** in `apps/web` after the final code edit.
- [ ] **Step 6: Run `git diff --check` and report branch/status**; do not commit, merge, reset, or push.
