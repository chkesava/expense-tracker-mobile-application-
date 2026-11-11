# SPENDLY-325: Define Salary Domain Model, Payroll Periods and Provenance

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-325](https://kesavach.atlassian.net/browse/SPENDLY-325)  
**Branch:** `feature/SPENDLY-325-salary-domain-model` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-325 establishes the foundational data architecture for Salary Intelligence across Spendly. It implements:
- Canonical TypeScript domain models for salary records, employment profiles, and compensation reviews.
- Zod runtime validation schemas enforcing strict financial invariants, non-negative amounts, date/month formats, and provenance tracking.
- Canonical domain builders and mutation generators compliant with Spendly's dual-store architecture (`commitMutations` -> Firestore -> local outbox -> Supabase `rm_client_apply`).
- Firestore security rules enforcing strict per-user multi-tenant isolation, well-formed document structure, immutable audit timestamps, and soft-delete transitions.
- Supabase read-model additive migration (`20261116000000_readmodel_salary.sql`) with Row-Level Security (RLS), ping triggers, cross-user allowlists, user purge routines, live count tallies, and data quality views.
- Cross-user collection-group field index overrides in `firestore.indexes.json`.

---

## 2. Changes Implemented

### Domain Models & Validation (`shared/features/salary/`)
- **`shared/features/salary/types/index.ts`**:
  - `SalaryFrequency`: `"monthly" | "biweekly" | "weekly" | "irregular"`.
  - `SalaryProvenance`: Source tracking (`"auto_detected" | "manual" | "imported" | "payslip_parsed"`), confidence score, source transaction reference, and review state (`"pending_review" | "confirmed" | "rejected" | "user_edited"`).
  - `SalaryComponentBreakdown`: Canonical Indian payroll structure — Basic, HRA, Special Allowance, PF/EPF, Professional Tax, TDS/Income Tax, Gratuity, ESOP deductions, and flexible other allowances/deductions.
  - `SalaryRecord`: Individual paycheck record with net amount, gross amount, deductions, pay period (`YYYY-MM`, start/end dates, pay date), employer, bank account reference, income transaction ID, breakdown, and soft-delete fields (`isDeleted`, `deletedAt`).
  - `SalaryProfile`: Persistent employment profile with employer name, designation, currency, pay frequency, typical payday, expected net, active status, and primary income account.
  - `SalaryReview`: Compensation revision log tracking effective date, revised CTC, previous CTC, revision percentage, and hike notes.
- **`shared/features/salary/schemas/index.ts`**:
  - Zod schemas validating ISO dates (`YYYY-MM-DD`), payroll months (`YYYY-MM`), non-negative currency amounts, and structural integrity.
- **`shared/features/salary/utils/builders.ts`**:
  - Canonical factory functions: `buildSalaryRecord`, `buildSalaryProfile`, `buildSalaryReview`, `reconcileSalaryBreakdown`, and `softDeleteSalaryRecord`.
- **`shared/features/salary/utils/writes.ts`**:
  - Helper functions producing `WriteOp` payloads for `commitMutations` targeting `/users/{uid}/salaryRecords`, `/users/{uid}/salaryProfiles`, and `/users/{uid}/salaryReviews`.
- **`shared/features/salary/utils/builders.test.ts` & `salaryRules.contract.test.ts`**:
  - 12 comprehensive unit and contract tests verifying reconciliation math, builder invariants, and rule property alignment.

### Firestore Security Rules & Indexes
- **`firestore.rules`**:
  - Excluded `salaryProfiles`, `salaryRecords`, `salaryReviews` from broad subcollection access.
  - Added dedicated helper functions: `salaryMonth`, `salaryYmd`, `salaryMoney`, `salaryStamps`, `salaryProfileWellFormed`, `salaryRecordWellFormed`, `salaryReviewWellFormed`.
  - Added scoped subcollection rule blocks:
    - `/users/{userId}/salaryProfiles/{profileId}`: Owner-only create/read/update/delete with schema validation.
    - `/users/{userId}/salaryRecords/{recordId}`: Owner-only create/read/update with soft-delete enforcement (active deletes rejected, requires `isDeleted: true`).
    - `/users/{userId}/salaryReviews/{reviewId}`: Owner-only create/read/update/delete with schema validation.
- **`firestore/salary.rules.test.ts`**:
  - Unit tests testing rules assertions across authentication, multi-tenant boundaries, and soft delete.
- **`firestore.indexes.json`**:
  - Added 12 collection-group field overrides for `salaryProfiles`, `salaryRecords`, `salaryReviews` on `createdAt`, `updatedAt`, `createdAtMs`, and `updatedAtMs` (total overrides = 178, safely below Firestore's 200 limit).

### Supabase Read Model Migration & Integration
- **`supabase-readmodel/supabase/migrations/20261116000000_readmodel_salary.sql`**:
  - Created tables `salary_profiles`, `salary_records`, `salary_reviews` with `id`, `user_id`, typed fields, `doc jsonb`, and audit timestamps.
  - Enabled RLS with `auth.uid() = user_id` policies for select, insert, update, and delete.
  - Configured `readmodel_bump_sync_ping` triggers on each table.
  - Updated `readmodel_sync_table_ok` and `readmodel_client_table_ok` to allowlist salary collections.
  - Updated `readmodel_purge_user` to cleanly delete salary rows when a user deletes their account.
  - Updated `readmodel_live_counts` and `v_data_quality` views.
- **`shared/utils/readModel/mapping.ts`**:
  - Added `salaryProfiles`, `salaryRecords`, `salaryReviews` to `READ_MODEL_TABLES` table specs and `EXTRA_CHANGE_FIELDS`.
- **`lib/readModelLocal/providerSwitch.test.ts`**:
  - Documented salary collections under `NOT_YET` with architectural reasoning (UI read-path switch is scheduled for SPENDLY-327 / SPENDLY-328 / SPENDLY-334).
- **`supabase-readmodel/tests/rls_behaviour.sql` & `tests/purge.sql`**:
  - Updated table counts (64 -> 67 tables; 128 -> 134 rows for user A, 64 -> 67 for user B).

---

## 3. Verification & Test Results

| Test Suite | Command | Result |
| :--- | :--- | :--- |
| **Salary Domain & Contract Tests** | `npm test -- --run shared/features/salary` | ✅ 12 passed (100%) |
| **Read Model Mapping & Spec Invariants** | `npm test -- --run shared/utils/readModel/mapping.test.ts` | ✅ 105 passed (100%) |
| **Firestore Cross-User Index Guards** | `npm test -- --run scripts/readmodelCrossUserIndexes.test.ts` | ✅ 166 passed (100%) |
| **Read Model Write Hooks** | `npm test -- --run lib/readModelWriteHooks.test.ts` | ✅ 8 passed (100%) |
| **Read Model Provider Switch & NOT_YET** | `npm test -- --run lib/readModelLocal/providerSwitch.test.ts` | ✅ 66 passed (100%) |
| **Read Model Listener Guards** | `npm test -- --run lib/readModelLocal/listenersOff.test.ts` | ✅ 4 passed (100%) |
| **TypeScript Shared Compilation** | `npm run typecheck:shared` | ✅ Clean (0 errors) |

---

## 4. Manual Verification & Leftovers

- **Manual Testing**:
  - N/A for Story 1 (Foundation / Domain Model / Schemas / Rules).
  - Domain tests and contract tests cover schema edge cases, reconciliation of gross/net/deductions, and Firestore rules format validation.
- **Rules Deployment Leftover**:
  - Firestore security rules updated in `firestore.rules`. Will deploy along with epic completion or via CI deploy step.
- **Supabase Migration Leftover**:
  - Migration file `20261116000000_readmodel_salary.sql` prepared for application to readmodel database upon deployment.
