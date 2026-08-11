# Test Bug Discovery Log

**Purpose:** Track defects found during testing-phase implementation and regression runs.

**Rules:**
- Do **not** invent bugs. Only log confirmed failures or static-analysis findings marked as potential.
- Every fixed bug should gain a regression test (unit and/or integration) before closing.
- Link related PRs/commits when available.

**Severity:** Critical | High | Medium | Low  
**Priority:** P0 | P1 | P2 | P3  
**Status:** Open | In Progress | Fixed | Verified | Won't Fix | Duplicate  
**Test Type:** Unit | Integration | Component | E2E | Manual | Static Analysis

---

## How to add an entry

Copy the template below. Increment `BUG-NNN` sequentially.

Mark static-analysis suspicions (not yet proven by a failing test) as:

> **Classification:** `Potential Issue — Requires Test Verification`

---

## Template

```text
BUG-XXX

Module:
Feature:
Test Suite:
Test Type:
Severity:
Priority:

Classification: Confirmed | Potential Issue — Requires Test Verification | Risk Area

Environment:

Preconditions:

Expected Behavior:

Actual Behavior:

Steps to Reproduce:

Evidence:

Root Cause:

Status:

Fix:

Regression Test:

Related PR/Commit:
```

---

## Potential issues from static analysis (pre-implementation)

These were found during the testing-strategy analysis. They are **not** confirmed runtime bugs until a test or manual repro proves them.

### BUG-001

```text
BUG-001

Module: Workspace / Navigation
Feature: Switch from Nutrition workspace back to Expense
Test Suite: TBD — navigation / workspace integration
Test Type: Static Analysis
Severity: High
Priority: P1

Classification: Potential Issue — Requires Test Verification

Environment: Expo Router app routes under `/(app)`, not `/(tabs)`

Preconditions: User has selected Nutrition workspace, then switches to Expense

Expected Behavior: Navigate to expense app shell (`/(app)` or default view)

Actual Behavior: `WorkspaceProvider.setActiveWorkspace('expense')` calls `router.replace('/(tabs)' as any)` while file routes live under `app/(app)/` (no matching `(tabs)` expense group in current router tree)

Steps to Reproduce:
1. Open app-selector / switch workspace to Nutrition
2. Switch back to Expense
3. Observe routing result

Evidence: `providers/WorkspaceProvider.tsx` — `router.replace('/(tabs)' as any)`

Root Cause: TBD (route path mismatch / leftover migration path)

Status: Open — Requires Test Verification

Fix: TBD

Regression Test: TBD — workspace switch expense ↔ nutrition

Related PR/Commit:
```

### BUG-002

```text
BUG-002

Module: Shared date/time utilities + consumers
Feature: Month/day keys for analytics, investments, OCR defaults, gamification
Test Suite: TBD — dates + consumer regression
Test Type: Static Analysis
Severity: High
Priority: P1

Classification: Potential Issue — Requires Test Verification

Environment: Devices in IST (UTC+5:30) near local midnight / month boundaries

Preconditions: App uses both `shared/utils/dates.ts` (local/timezone-aware keys) and `toISOString().slice(0, 7|10)` in multiple hooks/components/services

Expected Behavior: Consistent local calendar month/day for stored `expense.month` and UI filters

Actual Behavior: Possible UTC vs local disagreement between modules that format dates differently

Steps to Reproduce:
1. Set device timezone to Asia/Kolkata
2. Near local midnight, create expense / view analytics / set investment “today”
3. Compare stored month keys vs analytics filters

Evidence: `toISOString().slice` usage in e.g. `shared/utils/grouping.ts`, `insightMetrics.ts`, `insights.ts`, `aiAdvisorService.ts`, investment hooks/components, OCR default date, vault expenses, focus mode, gamification

Root Cause: TBD — inconsistent date-key helpers

Status: Open — Requires Test Verification

Fix: TBD

Regression Test: Partially added — `shared/utils/dates.test.ts` + frozen-time billing/credit tests. Phase 2 added coverage documenting UTC `toISOString` usage in `grouping`, `weeklySummary`, `insightMetrics`, OCR default date, and `aiAdvisorService` month scoping. Remaining consumer migration still open.

Related PR/Commit:
```

### BUG-003

```text
BUG-003

Module: SMS Automation (Android)
Feature: Inbox/receiver → parse → expense write
Test Suite: TBD — SMS pipeline + device validation
Test Type: Static Analysis
Severity: High
Priority: P1

Classification: Risk Area — Requires Test Verification

Environment: Android release / debug with READ_SMS + RECEIVE_SMS

Preconditions: SMS automation preferences enabled; bank SMS received

Expected Behavior: Reliable permission grant, parse, dedupe, review-before-add (or auto-commit only above confidence), duress blocks import

Actual Behavior: Parser is intentionally stubbed (`confidence: 0`); processor currently updates local inbound status without Firestore expense writes; `app.json` declares SMS permissions while checked `AndroidManifest.xml` may not list them until prebuild merge — drift risk

Steps to Reproduce:
1. Enable SMS automation prefs
2. Grant/deny permissions
3. Inject or receive bank SMS
4. Confirm no silent bad writes; confirm duress blocks pipeline

Evidence: `services/sms/smsParser.ts` stub; `smsTransactionProcessor.ts` local-status path; `app.json` vs native manifest

Root Cause: N/A (incomplete feature path + permission merge risk)

Status: Open — Risk Area

Fix: TBD (future SMS template phases)

Regression Test: TBD — parser templates, dedupe, duress, prefs gates, device permission matrix

Related PR/Commit: feature/sms-automation branch work
```

### BUG-004

```text
BUG-004

Module: Auth / Privacy
Feature: Duress PIN → proxied Firestore UID
Test Suite: `lib/privacySession.test.ts`, `lib/authHelpers.test.ts` (+ AuthProvider integration still TBD Phase 5)
Test Type: Unit / Static Analysis
Severity: Critical
Priority: P0

Classification: Risk Area — Requires Test Verification

Environment: App with privacy lock / duress PIN configured

Preconditions: Real Firebase user signed in; user unlocks with duress PIN

Expected Behavior: All Firestore paths use `uid_duress`; SMS import blocked; real data never visible or writable under duress session

Actual Behavior: Must be verified end-to-end — unit coverage now locks `createDuressUser` UID proxy + privacySession lock/duress/lockout contracts. Full AuthProvider ↔ Firestore path isolation still needs emulator integration.

Steps to Reproduce:
1. Configure duress PIN
2. Unlock with duress
3. Attempt add expense / read ledger / enable SMS
4. Inspect Firestore paths and UI data

Evidence: `lib/authHelpers.ts` (`uid + "_duress"`); `lib/privacySession.ts`; SMS gates on `isDuress` (when present)

Root Cause: TBD if any failure found

Status: Open — Partial unit coverage in Phase 4; integration still required

Fix: TBD

Regression Test: `lib/authHelpers.test.ts`, `lib/privacySession.test.ts`

Related PR/Commit:
```

### BUG-005

```text
BUG-005

Module: Subscriptions / EMI
Feature: Auto-post due subscriptions via writeBatch
Test Suite: TBD — subscriptionProcessor + useSubscriptions orchestration
Test Type: Static Analysis
Severity: Critical
Priority: P0

Classification: Risk Area — Requires Test Verification

Environment: Online app with due subscriptions/EMIs

Preconditions: Subscriptions with next due date on/near today; app idle scheduling runs

Expected Behavior: Exactly-once posting per due period; correct expense/transfer documents; `lastProcessed` advanced safely across timezones

Actual Behavior: Pure due-date util is unit-tested; hook orchestration (idle schedule + batch write + double-fire) is not

Steps to Reproduce:
1. Seed subscription due today
2. Open app twice quickly / toggle network / change timezone
3. Count created expenses

Evidence: `hooks/useSubscriptions.ts` + `shared/utils/subscriptionProcessor.ts`

Root Cause: TBD

Status: Open — Requires Test Verification

Fix: TBD

Regression Test: TBD — idempotency / double-fire / timezone edge cases

Related PR/Commit:
```

### BUG-006

```text
BUG-006

Module: Accounts / Balances
Feature: Bank balance, transfers, credit billing cycles
Test Suite: Partial — `accountBalance.test.ts`, `accountActivities.test.ts`
Test Type: Static Analysis
Severity: High
Priority: P1

Classification: Risk Area — Requires Test Verification

Environment: Accounts with mixed expenses, income, transfers, external credit payments, cycle boundaries

Preconditions: Credit card with billing cycle + notes regex payment matching paths

Expected Behavior: Running balance and credit cycle match user mental model; transfers not double-counted as expenses

Actual Behavior: Complex paths exist (structured fields OR note regex / date parse); expand coverage for cycle edges and external payments

Steps to Reproduce: TBD with fixture matrix

Evidence: `shared/utils/accountBalance.ts`, `billingCycle.ts`

Root Cause: TBD

Status: Open — Expand test coverage (Phase 1 matrix added: baseline cutoff, appliedCycle payments, bill history paid/partial, previews)

Fix: TBD

Regression Test: Expanded in `shared/utils/accountActivities.test.ts` + `billingCycle.test.ts`

Related PR/Commit:
```

### BUG-007

```text
BUG-007

Module: Nutrition workspace
Feature: Nutrition dashboard data source
Test Suite: TBD
Test Type: Static Analysis
Severity: Medium
Priority: P2

Classification: Potential Issue — Requires Test Verification

Environment: Nutrition workspace UI

Preconditions: `useNutrition` hook exists; dashboard may still show mock meals

Expected Behavior: Single source of truth for meals logged

Actual Behavior: Dual path risk (mock UI vs live hook) — verify which path ships

Steps to Reproduce: Open nutrition index; log meal; confirm UI updates from Firestore vs hardcoded data

Evidence: `app/(nutrition)/index.tsx` vs `hooks/useNutrition.ts`

Root Cause: TBD (product incompleteness)

Status: Open — Requires Test Verification

Fix: TBD

Regression Test: TBD

Related PR/Commit:
```

---

### BUG-008

```text
BUG-008

Module: UI / common Modal + TypeScript gate
Feature: Full-app `npm run typecheck`
Test Suite: Baseline typecheck (Phase 0)
Test Type: Static Analysis / Tooling
Severity: Medium
Priority: P2

Classification: Potential Issue — Requires Test Verification

Environment: TypeScript ~6 / Expo 57 on docs/testing-master-plan (main)

Preconditions: Run `npm run typecheck`

Expected Behavior: Clean typecheck for release/PR gates (Phase 9+)

Actual Behavior: Fails with:
`components/common/Modal.tsx(174,19): error TS2551: Property 'absoluteFillObject' does not exist on type 'typeof StyleSheet'. Did you mean 'absoluteFill'?`

Steps to Reproduce:
1. On latest main checkout
2. npm run typecheck

Evidence: Phase 0 baseline run 2026-08-11

Root Cause: TBD — RN StyleSheet API / types mismatch

Status: Open — Requires fix before treating full typecheck as mandatory CI gate

Fix: TBD (use StyleSheet.absoluteFill or compatible typing)

Regression Test: TBD — typecheck in CI

Related PR/Commit:
```

---

### BUG-009

```text
BUG-009

Module: shared/utils/dates
Feature: isValidMonthKey
Test Suite: shared/utils/dates.test.ts
Test Type: Unit / Static Analysis
Severity: Low
Priority: P3

Classification: Potential Issue — Requires Test Verification

Environment: Node Vitest

Preconditions: Call isValidMonthKey("2026-13")

Expected Behavior: Reject impossible months if used as semantic validation

Actual Behavior: Returns true — format-only `/^\d{4}-\d{2}$/` check (documented in unit test)

Steps to Reproduce: See dates.test.ts "accepts YYYY-MM shape for month keys"

Evidence: Phase 1 unit test intentionally asserts current behavior

Root Cause: Intentional format-only helper — or incomplete validation (TBD product decision)

Status: Open — Product decision whether to tighten validation

Fix: TBD

Regression Test: dates.test.ts documents current contract

Related PR/Commit:
```

---

### BUG-010

```text
BUG-010

Module: services/ocrService
Feature: Receipt date parsing (numeric forms)
Test Suite: services/ocrService.test.ts
Test Type: Unit / Static Analysis
Severity: Medium
Priority: P2

Classification: Potential Issue — Requires Test Verification

Environment: Node Vitest / device OCR

Preconditions: Receipt text contains a numeric date like 08/11/2026

Expected Behavior: Interpret per locale / unambiguous ISO when possible

Actual Behavior: Second pattern treats values as DD/MM/YYYY (day first). US MM/DD receipts may be mis-parsed.

Steps to Reproduce: parseReceiptOcrText("Shop\n08/11/2026\nTotal: 10") — currently becomes 2026-11-08

Evidence: ocrService.ts datePatterns + Phase 2 unit tests for DD/MM form

Root Cause: Assumed day-first numeric dates

Status: Open — Requires Test Verification / product locale decision

Fix: TBD

Regression Test: Partial — DD/MM case covered; MM/DD ambiguity not yet locked

Related PR/Commit:
```

---

## Confirmed bugs found during testing phases

*(None yet — product test failures. Tooling debt logged above as BUG-008.)*

---

## Index

| ID | Module | Classification | Severity | Status |
| ---- | ------ | -------------- | -------- | ------ |
| BUG-001 | Workspace navigation | Potential Issue — Requires Test Verification | High | Open |
| BUG-002 | Date/time keys | Potential Issue — Requires Test Verification | High | Open |
| BUG-003 | SMS automation | Risk Area — Requires Test Verification | High | Open (deferred until SMS merges) |
| BUG-004 | Auth duress | Risk Area — Requires Test Verification | Critical | Open |
| BUG-005 | Subscription auto-post | Risk Area — Requires Test Verification | Critical | Open |
| BUG-006 | Account balances | Risk Area — Requires Test Verification | High | Open |
| BUG-007 | Nutrition data source | Potential Issue — Requires Test Verification | Medium | Open |
| BUG-008 | Full app typecheck / Modal | Potential Issue — Requires Test Verification | Medium | Open |
| BUG-009 | isValidMonthKey format-only | Potential Issue — Requires Test Verification | Low | Open |
| BUG-010 | OCR DD/MM vs MM/DD date parse | Potential Issue — Requires Test Verification | Medium | Open |
