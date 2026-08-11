# TESTING PHASE CHECKLIST

Companion to `TESTING_MASTER_PLAN.md` and `TEST_BUG_DISCOVERY_LOG.md`.

**Rules:**
- Check items only when truly complete.
- Implement only the phase that has been explicitly approved.
- Log bugs in `TEST_BUG_DISCOVERY_LOG.md` during implementation/verification.
- Phase exit requires human approval before starting the next phase (unless parallel SMS path is approved).
- Baseline record: `docs/TESTING_BASELINE.md`

---

## Global prerequisites

- [x] Testing master plan reviewed
- [x] Testing master plan explicitly approved for implementation
- [x] Target git branch confirmed (`docs/testing-master-plan` from latest `origin/main`)
- [x] Re-diff against `main` completed if implementing from a feature branch *(branch IS latest main)*
- [x] Bug discovery log template understood
- [x] Agreement: no production Firebase data in automated tests
- [x] Agreement: no signing secrets on pull_request workflows

---

## Phase 0 — Testing Infrastructure & Baseline Freeze

- [x] Module analysis freeze acknowledged
- [x] Existing Vitest config documented (`shared/**/*.test.ts` only on main; node env) — see `docs/TESTING_BASELINE.md`
- [x] Baseline `npm test` run recorded — **PASS** 22 files / 122 tests
- [x] Baseline `npm run typecheck` / `typecheck:shared` strategy noted — shared fixed & green; full app fails BUG-008
- [x] Firebase Emulator vs repository-fakes decision documented — **Emulator-first for Phase 5+**
- [x] Test env variable strategy documented
- [x] CI constraint confirmed (release secrets stay off fork PRs)
- [x] Unit test scope identified (tooling only — no new product tests)
- [x] Integration test scope identified (harness decision only)
- [x] Edge cases identified (secret isolation, include globs, SMS absent on main)
- [x] Test implementation completed *(N/A product tests)* — tooling: `tsconfig.shared.json` paths/DOM/`ignoreDeprecations`
- [x] Tests passing (existing suite green)
- [x] Bugs documented (baseline: BUG-008; SMS BUG-003 deferred on main)
- [x] Bugs fixed *(baseline test failures: none; shared typecheck config fixed)*
- [x] Regression tests added *(N/A — no product failures)*
- [x] Phase approved

---

## Phase 1 — Core Calendar & Money Primitives

- [x] Module analysis complete (`dates`, `billingCycle`, account balance edges)
- [x] Unit test scope identified
- [x] Integration test scope identified (none / minimal)
- [x] Edge cases identified (IST midnight, leap years, credit cycle boundaries)
- [x] Test implementation completed (`dates.test.ts`, `billingCycle.test.ts`, expanded `accountActivities.test.ts`)
- [x] Tests passing — 24 files / 143 tests
- [x] Bugs documented (BUG-002 / BUG-006 progress notes; BUG-009 month-key format-only)
- [x] Bugs fixed *(none required for Phase 1 — coverage only)*
- [x] Regression tests added *(calendar + credit cycle matrix)*
- [ ] Phase approved *(waiting for human exit sign-off)*

---

## Phase 2 — Shared Business Logic Completeness

- [ ] Module analysis complete (remaining `shared/utils`, OCR, advisor filters, net-worth extract)
- [ ] Unit test scope identified
- [ ] Integration test scope identified
- [ ] Edge cases identified (empty/large datasets, month key alignment)
- [ ] Test implementation completed
- [ ] Tests passing
- [ ] Bugs documented
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 3 — SMS Automation Unit Hardening

- [ ] Module analysis complete (`services/sms/*`, types, prefs, gates)
- [ ] Unit test scope identified (parser fixtures, dedupe, pipeline, relevance)
- [ ] Integration test scope identified (prefs ↔ processor ↔ status)
- [ ] Edge cases identified (duress, OTP noise, review-before-add, stub confidence)
- [ ] Confirmation: no silent Firestore expense writes without coverage
- [ ] Test implementation completed
- [ ] Tests passing
- [ ] Bugs documented (BUG-003)
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 4 — Auth, Privacy, Settings

- [ ] Module analysis complete (AuthProvider, privacySession, settings merge, Google client)
- [ ] Unit test scope identified
- [ ] Integration test scope identified (duress UID isolation, category seed)
- [ ] Edge cases identified (lockout, concurrent unlock, missing web client id)
- [ ] Test implementation completed
- [ ] Tests passing
- [ ] Bugs documented (BUG-004)
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 5 — Data Layer Integration

- [ ] Module analysis complete (FinanceData, Network, syncStatusStore)
- [ ] Unit test scope identified
- [ ] Integration test scope identified (CRUD, pending writes, reconnect)
- [ ] Edge cases identified (staged history load, listener failure)
- [ ] Emulator/fake harness available
- [ ] Test implementation completed
- [ ] Tests passing
- [ ] Bugs documented
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 6 — Module Integrations (Money Features)

- [ ] Module analysis complete (subscriptions, vaults, splits, transfers)
- [ ] Unit test scope identified (gap fills)
- [ ] Integration test scope identified (auto-post idempotency, vault tx, splits, transfers)
- [ ] Edge cases identified (double-fire, timezone due dates)
- [ ] Test implementation completed
- [ ] Tests passing
- [ ] Bugs documented (BUG-005)
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 7 — Cross-Module Journeys & Navigation

- [ ] Module analysis complete (workspace, journeys, export, payment links)
- [ ] Unit test scope identified
- [ ] Integration / journey scope identified
- [ ] Edge cases identified (BUG-001 `/(tabs)` vs `/(app)`)
- [ ] Test implementation completed
- [ ] Tests passing
- [ ] Bugs documented (BUG-001, BUG-007 if still open)
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 8 — Android Native & Device Validation

- [ ] Module analysis complete (sms-reader module, permissions, PrivacyLock, prebuild manifest)
- [ ] Unit test scope identified (N/A / mock bridges)
- [ ] Device / instrumented scope identified
- [ ] Edge cases identified (permission deny, OEM SMS, duress disables receiver)
- [ ] Manual device checklist executed
- [ ] Test implementation completed *(where automatable)*
- [ ] Validation passing
- [ ] Bugs documented
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 9 — Regression Pack & CI Enforcement

- [ ] Module analysis complete (GitHub Actions PR strategy)
- [ ] Unit suites wired to PR CI
- [ ] Integration suites wired to PR CI
- [ ] Typecheck wired to PR CI
- [ ] Required checks configured for merge
- [ ] Confirmed: no keystore / service-account on `pull_request`
- [ ] Flake rate acceptable
- [ ] Bugs documented (CI-related)
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved

---

## Phase 10 — Android Release Gate

- [ ] Module analysis complete (android-release workflow gate)
- [ ] Mandatory test step runs **before** APK build
- [ ] `release:verify` included
- [ ] Typecheck included
- [ ] SMS/device pack gating defined when SMS ships
- [ ] Failed tests block distribution
- [ ] Job summary includes test result signal
- [ ] Bugs documented
- [ ] Bugs fixed
- [ ] Regression tests added
- [ ] Phase approved
- [ ] Testing program Definition of Done reviewed (`TESTING_MASTER_PLAN.md` §23)

---

## Future feature rule (ongoing — after rules applied)

Use for every meaningful change after Cursor/Antigravity rules are installed:

- [ ] Affected modules identified
- [ ] Affected test suites identified
- [ ] Unit tests added/updated when business logic changed
- [ ] Integration tests added/updated when cross-module behavior changed
- [ ] Regression tests added when fixing a bug
- [ ] Existing tests reviewed (not deleted to force green)
- [ ] Local `npm test` (+ typecheck) run before push
- [ ] Bug log updated if defect found
- [ ] PR describes test impact

---

## Phase approval log

| Phase | Approved by | Date | Notes |
|-------|-------------|------|-------|
| Plan (this pack) | User | 2026-08-11 | Explicit approval to start Phase 0 |
| 0 | User | 2026-08-11 | Exit signed off; baseline frozen in `docs/TESTING_BASELINE.md` |
| 1 | | | Implemented; awaiting exit sign-off (24 files / 143 tests) |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |

---

**Phase 0 note:** No new product test cases were added. Existing Vitest suite remains the product baseline. Tooling change: `tsconfig.shared.json` (+ `docs/TESTING_BASELINE.md`).
