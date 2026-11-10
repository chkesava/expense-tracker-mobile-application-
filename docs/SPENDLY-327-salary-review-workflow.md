# SPENDLY-327: Build Salary Review, Confirmation and Correction Workflow

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-327](https://kesavach.atlassian.net/browse/SPENDLY-327)  
**Branch:** `feature/SPENDLY-327-salary-review-workflow` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-327 implements the complete review, confirmation, correction, and override workflow for salary candidates.

### Key Capabilities:
1. **Confirm Salary**:
   - Confirms a detected salary candidate and writes a canonical `SalaryRecord` under `users/{uid}/salaryRecords/sal_{incomeId}`.
   - Writes a persistent `SalaryReview` under `users/{uid}/salaryReviews/income__{incomeId}` with `decision: "confirm"`.
   - Records `provenance.source = "user_confirmed"` and audit timestamp `reviewedAtMs`.
2. **Not Salary (Rejection)**:
   - User rejects false positives with explicit reasons (`not_salary`, `transfer`, `reimbursement`, `loan`, `other`).
   - Writes `SalaryReview` with `decision: "reject"`.
   - Permanently filters the transaction out from all future detection runs.
   - If a `SalaryRecord` existed, safely soft-deletes it with `deletedAt`.
3. **Change Employer / Pay Period / Classification**:
   - Users can correct the employer name, wage month (`YYYY-MM`), and payment classification (`regular`, `bonus`, `incentive`, `reimbursement`, `stipend`, `severance`).
   - Records `provenance.source = "user_corrected"` and preserves original detected values in `provenance.originalValues` (`netAmount`, `month`, `employerName`, `salaryType`).
4. **Gross Pay & Component Breakdown**:
   - Allows users to enter Gross Pay and optional deductions (EPF, TDS, Professional Tax).
   - Validates mathematical reconciliation (`Gross - Deductions = Net`) via `reconcileSalaryBreakdown`.
5. **Bulk Review**:
   - `confirmSalaryCandidatesBulk`: Confirms multiple candidates in atomic batches (respecting Firestore batch limits).
   - `rejectSalaryCandidatesBulk`: Rejects multiple candidates in atomic batches.
6. **Dual-Store Outbox Durability**:
   - All mutations execute through `commitMutations`: Firestore first, then on-device outbox to Supabase `rm_client_apply` (READ_MODEL_RULES R1).
   - Durability outcomes (`acked`, `queued`, `unsafe`) reported truthfully without UI freezing.
7. **Interactive UI Review Sheet (`SalaryReviewModal.tsx`)**:
   - Responsive modal with Overview, Edit Details, and Not Salary tabs.
   - Displays confidence badges, recognition signals, amount, wage month, correction history, and offline status.

---

## 2. Changes Implemented

### Domain Review Utilities (`shared/features/salary/utils/review.ts`)
- `buildReviewDocId`: Formats deterministic doc ID `income__{incomeId}`.
- `buildConfirmedRecordFromCandidate`: Pure builder applying overrides and tracking original values.
- `buildSalaryReviewDoc`: Pure builder creating `SalaryReview` records.
- `applySalaryRecordCorrection`: Pure function applying updates to existing records while preserving original values.
- `resolveCandidateResolution`: Resolves candidate state to `"pending" | "confirmed" | "corrected" | "rejected"`.

### Salary Persistence Store (`services/salary/salaryStore.ts`)
- `confirmSalaryCandidate`: Creates `SalaryRecord` and `SalaryReview`.
- `rejectSalaryCandidate`: Creates `SalaryReview` and soft-deletes record if previously created.
- `correctSalaryRecord`: Updates `SalaryRecord` and updates `SalaryReview`.
- `deleteSalaryRecord`: Soft-deletes `SalaryRecord`.
- `confirmSalaryCandidatesBulk`: Batch confirms candidates.
- `rejectSalaryCandidatesBulk`: Batch rejects candidates.
- `clearSalaryReview`: Deletes review doc to restore transaction to automatic detection.

### Action Hook (`hooks/useSalaryReviewActions.ts`)
- React hook exposing `confirm`, `reject`, `correct`, `remove`, `confirmBulk`, `rejectBulk`, and `undo`.
- Handles `saving` states, error logging, and toast notifications via `writeSavedMessage`.

### UI Component (`components/salary/SalaryReviewModal.tsx`)
- Presentational sheet allowing users to view evidence, quick-confirm, edit employer/wage month/gross pay/breakdown, or exclude transactions with reasons.

---

## 3. Verification & Test Results

| Test Suite | File | Tests | Result |
| :--- | :--- | :--- | :--- |
| **Salary Review Utilities** | `shared/features/salary/utils/review.test.ts` | 9 | ✅ Passed |
| **Salary Store Actions** | `services/salary/salaryStore.test.ts` | 7 | ✅ Passed |
| **Salary Detection Engine** | `shared/features/salary/utils/detectSalary.test.ts` | 12 | ✅ Passed |
| **Payroll Normalization** | `shared/features/salary/utils/payrollNormalize.test.ts` | 20 | ✅ Passed |
| **Salary Domain Builders** | `shared/features/salary/utils/builders.test.ts` | 7 | ✅ Passed |
| **Salary Rules Contract** | `shared/features/salary/salaryRules.contract.test.ts` | 5 | ✅ Passed |
| **Total Salary Feature Tests** | `npm test -- --run shared/features/salary services/salary` | **60** | ✅ **60/60 passed (100%)** |
| **Read Model Mapping Guard** | `shared/utils/readModel/mapping.test.ts` | 105 | ✅ Passed |
| **Firestore Cross-User Indexes** | `scripts/readmodelCrossUserIndexes.test.ts` | 166 | ✅ Passed |
| **Read Model Write Hooks** | `lib/readModelWriteHooks.test.ts` | 8 | ✅ Passed |
| **Read Model Provider Switch** | `lib/readModelLocal/providerSwitch.test.ts` | 66 | ✅ Passed |
| **Read Model Listeners Guard** | `lib/readModelLocal/listenersOff.test.ts` | 4 | ✅ Passed |
| **Shared Package Typecheck** | `npm run typecheck:shared` | - | ✅ **0 errors** |
| **Root Project Typecheck** | `npm run typecheck` | - | ✅ **0 errors** |

---

## 4. Manual Testing Guide

1. **Quick Confirm**:
   - Open `SalaryReviewModal` with a candidate (e.g. `₹1,25,000` from `Acme Technologies`).
   - Tap "Confirm Salary".
   - Verify success toast "Salary confirmed" appears, and record is saved with `status: "confirmed"`.
2. **Edit & Correct**:
   - In `SalaryReviewModal`, tap "Edit Details" tab.
   - Change employer name, wage month, or add Gross Pay (e.g. `₹1,50,000`).
   - Tap "Save & Confirm Changes".
   - Verify record is saved with `provenance.source: "user_corrected"` and correction history displays original values.
3. **Not Salary**:
   - Select "Not Salary" tab, choose "Transfer / P2P", and tap "Exclude Transaction".
   - Verify transaction is excluded and future scans omit it.
