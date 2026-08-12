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

Evidence: Was `router.replace('/(tabs)')`; now `resolveWorkspaceRoute` → `/(app)`

Root Cause: TBD (route path mismatch / leftover migration path)

Status: Fixed

Fix: `resolveWorkspaceRoute` maps expense → `/(app)`; `WorkspaceProvider` uses it

Regression Test: `shared/config/workspaceRoutes.test.ts`, `shared/config/journeys.test.ts`

Related PR/Commit: Phase 7 on docs/testing-master-plan
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

Evidence: Was widespread `toISOString().slice` for calendar keys; production consumers migrated to `todayDateKey` / `currentMonthKey` / `toLocalDateKey` / `parseLocalDate`. Remaining `toISOString().slice` only in `magicParser.test.ts` (test fixture).

Root Cause: Mixing UTC ISO strings with local calendar keys

Status: Fixed

Fix: Shared date helpers + consumer migration across hooks, components, services, and shared utils

Regression Test: `shared/utils/dates.test.ts`, grouping/weeklySummary/insightMetrics/OCR/AI advisor tests; production grep clean except intentional test fixture

Related PR/Commit: bug-ticket batch on docs/testing-master-plan
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

Status: Deferred — SMS module not on this branch (main / docs/testing-master-plan). Reopen when SMS merges.

Fix: N/A until SMS lands

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

Evidence: `lib/authHelpers.ts` (`uid + "_duress"`); `lib/privacySession.ts`; `lib/duressPath.contract.test.ts` documents collection path must use proxied uid

Root Cause: N/A for unit contract — helpers correct. Full AuthProvider ↔ Firestore isolation still needs emulator.

Status: Fixed (unit/contract) — Deferred (AuthProvider + Firestore emulator E2E)

Fix: Unit coverage for createDuressUser + privacy session + path contract. Emulator integration deferred (Phase 8 / follow-up).

Regression Test: `lib/authHelpers.test.ts`, `lib/privacySession.test.ts`, `lib/duressPath.contract.test.ts`

Related PR/Commit: Phase 4 + bug-ticket batch
```

### BUG-005

```text
BUG-005

Module: Subscriptions / EMI
Feature: Auto-post due subscriptions via writeBatch
Test Suite: `subscriptionProcessor` planDueSubscriptionPosts + moneyFlows integration
Test Type: Unit / Integration-lite / Static Analysis
Severity: Critical
Priority: P0

Classification: Risk Area — Requires Test Verification

Environment: Online app with due subscriptions/EMIs

Preconditions: Subscriptions with next due date on/near today; app idle scheduling runs

Expected Behavior: Exactly-once posting per due period; correct expense/transfer documents; `lastProcessed` advanced safely across timezones

Actual Behavior: Planner + idempotency covered; `useSubscriptions` now calls `planDueSubscriptionPosts` then writes plan payloads. Device/emulator double-fire still deferred (Phase 8).

Steps to Reproduce:
1. Seed subscription due today
2. Open app twice quickly / toggle network / change timezone
3. Count created expenses

Evidence: `hooks/useSubscriptions.ts` + `shared/utils/subscriptionProcessor.ts`

Root Cause: N/A for planner path — hook now uses shared planner

Status: Fixed (planner + hook wiring) — Deferred (device double-fire verification)

Fix: `useSubscriptions` uses `planDueSubscriptionPosts`; skip subscriptions without `id`

Regression Test: `subscriptionProcessor.test.ts` idempotency + `moneyFlows.integration.test.ts`

Related PR/Commit: Phase 6 + bug-ticket batch
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

Actual Behavior: Credit-cycle expense dates use `parseLocalDate` (local calendar), not UTC `Date` parse. Broader balance matrix remains covered by Phase 1 tests.

Steps to Reproduce: TBD with fixture matrix

Evidence: `shared/utils/accountBalance.ts`, `billingCycle.ts`

Root Cause: UTC vs local date parse on credit expense filtering

Status: Fixed (credit expense local date parse)

Fix: `parseLocalDate` for credit cycle expense date comparisons

Regression Test: Expanded in `shared/utils/accountActivities.test.ts` + `billingCycle.test.ts` + accountBalance coverage

Related PR/Commit: bug-ticket batch
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

Actual Behavior: Was mock/hardcoded; now reads `useNutrition(todayDateKey())` for macros, water, and meals (empty meal slots until logged).

Steps to Reproduce: Open nutrition index; log meal; confirm UI updates from live hook vs hardcoded data

Evidence: `app/(nutrition)/index.tsx` + `hooks/useNutrition.ts`

Root Cause: Dashboard shipped with mock meal data

Status: Fixed

Fix: Wire dashboard to `useNutrition`; empty meal placeholders when no log meals; optional `meals` on `DailyLogSummary`

Regression Test: Manual — Nutrition workspace; typecheck/runtime load

Related PR/Commit: bug-ticket batch
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

Actual Behavior: Was failing on `StyleSheet.absoluteFillObject`. Now uses `StyleSheet.absoluteFill`. Full `npm run typecheck` passes.

Steps to Reproduce:
1. On latest docs/testing-master-plan checkout
2. npm run typecheck

Evidence: Phase 0 baseline run 2026-08-11; re-verified green after fix

Root Cause: Deprecated/removed StyleSheet API in current RN typings

Status: Fixed

Fix: `StyleSheet.absoluteFill` in `components/common/Modal.tsx`

Regression Test: `npm run typecheck` green (gate for Phase 9 CI)

Related PR/Commit: bug-ticket batch
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

Actual Behavior: Was format-only and accepted `2026-13`. Now rejects month outside 01–12.

Steps to Reproduce: See dates.test.ts isValidMonthKey cases

Evidence: Phase 1 unit tests updated for semantic month range

Root Cause: Format-only regex without month range check

Status: Fixed

Fix: Validate month in 01–12 after format match

Regression Test: `shared/utils/dates.test.ts` (`2026-13` / `2026-00` false)

Related PR/Commit: bug-ticket batch
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

Expected Behavior: India default day-first for ambiguous numeric dates; when day > 12, treat first part as month

Actual Behavior: INR day-first preferred (`08/11/2026` → `2026-11-08`); `08/25/2026` → `2026-08-25`. Fallback date uses `todayDateKey()`.

Steps to Reproduce: See ocrService.test.ts DD/MM + ambiguity cases

Evidence: ocrService.ts datePatterns + unit tests

Root Cause: Locale ambiguity for numeric dates — product choice India DD/MM

Status: Fixed (INR day-first policy locked in tests)

Fix: Day-first when second ≤ 12; month-first when second > 12; local `todayDateKey` fallback

Regression Test: `services/ocrService.test.ts` (DD/MM, ambiguous, second>12, local fallback)

Related PR/Commit: bug-ticket batch
```

---

## Confirmed bugs found during testing phases

BUG-008 was confirmed by failing `npm run typecheck` and is now fixed. Other tickets were static-analysis / risk items closed with code + regression coverage above.

---

## Index

| ID | Module | Classification | Severity | Status |
| ---- | ------ | -------------- | -------- | ------ |
| BUG-001 | Workspace navigation | Fixed — `/(app)` route | High | Fixed |
| BUG-002 | Date/time keys | Fixed — local date helpers | High | Fixed |
| BUG-003 | SMS automation | Risk Area — SMS not on branch | High | Deferred |
| BUG-004 | Auth duress | Unit/contract fixed; emulator deferred | Critical | Fixed (unit) / Deferred (E2E) |
| BUG-005 | Subscription auto-post | Planner + hook wired; device deferred | Critical | Fixed (code) / Deferred (device) |
| BUG-006 | Account balances | Credit cycle local date parse | High | Fixed |
| BUG-007 | Nutrition data source | Live `useNutrition` wired | Medium | Fixed |
| BUG-008 | Full app typecheck / Modal | `absoluteFill` + typecheck green | Medium | Fixed |
| BUG-009 | isValidMonthKey | Month 01–12 validation | Low | Fixed |
| BUG-010 | OCR DD/MM vs MM/DD | INR day-first policy + tests | Medium | Fixed |
