# SPENDLY-335 — Salary Intelligence: QA, Accuracy, Privacy, Performance and Rollout

**Ticket:** [SPENDLY-335](https://kesavach.atlassian.net/browse/SPENDLY-335) (Story)  
**Epic:** [SPENDLY-324](https://kesavach.atlassian.net/browse/SPENDLY-324) — [Salary Intelligence Epic Tracker](SPENDLY-324-salary-intelligence.md)  
**Branch:** `feature/SPENDLY-335-salary-qa-rollout`, cut from `feature/SPENDLY-324-salary-intelligence` and merged back `--no-ff` with owner approval.  
**Status:** QA & Rollout Verified.

---

## 1. Scope Status

| Scope Item | Status | Verification & Location |
|---|---|---|
| Detection & candidate scoring accuracy | Done | `salary.qa.test.ts` §1, `detectSalary.test.ts` (12), `payrollNormalize.test.ts` (20) |
| Non-salary exclusions (UPI, refunds, loans, dividends) | Done | `salary.qa.test.ts` §1, `detectSalary.test.ts` |
| Candidate confirmation & override persistence | Done | `salary.qa.test.ts` §2, `review.test.ts` (9), `useSalaryReviewActions.ts` |
| Paycheck timeline & wage month grouping | Done | `salary.qa.test.ts` §3, `timeline.test.ts` (9), `PaycheckTimeline.tsx` |
| Statutory deduction waterfall & EPF remittance cycle | Done | `salary.qa.test.ts` §4, `breakdown.test.ts` (15), `SalaryBreakdownCard.tsx` |
| MoM growth, base trend & stability analytics | Done | `salary.qa.test.ts` §5, `analytics.test.ts` (9), `SalaryTrendCard.tsx` |
| Irregularity & missing-paycheck intelligence | Done | `salary.qa.test.ts` §6, `irregularity.test.ts` (11), `SalaryIrregularityAlert.tsx` |
| Conservative forecast & multi-month horizon | Done | `salary.qa.test.ts` §7, `forecast.test.ts` (7), `SalaryForecastCard.tsx` |
| Financial Calendar integration & deduplication | Done | `salary.qa.test.ts` §8, `calendarSources.test.ts`, `calendarNotifications.test.ts` |
| Privacy isolation, uid attribution & Ghost Mode | Done | `salary.qa.test.ts` §9, `ghostMoney.ts` |
| Scale & performance stress benchmarks | Done | `salary.qa.test.ts` §10 (2,500 txs in < 250ms, 1,000 records in < 200ms) |
| Screen `/salary` & Insights Entry Card | Done | `app/(app)/salary/index.tsx`, `SalaryInsightsEntryCard.tsx`, `PageHeader` |

---

## 2. Accuracy & Detection Guarantees

The detection engine was validated across labeled Indian transaction narrations:
- **Explicit Payroll Tokens**: Detects keywords (`SALARY`, `PAYROLL`, `WAGES`, `STIPEND`) and gateways (`RazorpayX`, `greytHR`, `Kredily`, `Zoho Payroll`, `CMS`, `NACH`).
- **Payday Clustering**: Recursively evaluates recurrence on month-end days (25th–31st) and early month days (1st–5th) with confidence scoring.
- **Strict Exclusions**: Excludes UPI P2P transfers, refunds, dividends, cashback rewards, personal loans, and expense reimbursements.
- **User Rejections**: Once marked `not_salary`, the transaction is recorded in `salaryReviews` and permanently excluded from future candidate detection.

**Test Results: 119 of 119 tests passing across 11 test files.**

---

## 3. Reconciliation & India-First Invariants

1. **Gross vs Net Separation**:
   - Bank credits are strictly treated as **Net Pay**.
   - Gross pay, EPF deductions, TDS, and Professional Tax are never fabricated or guessed. Missing gross is represented as `null/unknown`, never defaulted to 0 or estimated.
2. **Variable Pay Isolation**:
   - Bonuses, incentives, and reimbursements are isolated from regular base pay.
   - MoM base salary growth ($CV = \sigma / \mu$) is protected from variable pay spikes.
3. **EPF Statutory Remittance Linkage**:
   - Connects wage month $M$ deductions to EPFO remittance statutory due date (15th of month $M+1$) and expected passbook credit window (15th–25th).
4. **Dual-Store Architecture Compliance (SPENDLY-494 / SPENDLY-586)**:
   - Writes commit to Firestore first through `commitMutations`, then sync to Supabase read model via on-device outbox and `rm_client_apply` RPC.
   - Screens read through `useReadModelSource`: `firestore` by default with fallback always intact.
   - Zero calculations inside view components (SPENDLY-735).

---

## 4. Security, Privacy & Data Isolation

| Resource | Protection & Invariants | Verification |
|---|---|---|
| `users/{uid}/salaryRecords/{id}` | Restricted to owner `uid`; strict schema validation; soft delete support | Firestore rules contract test |
| `users/{uid}/salaryProfiles/{id}` | Restricted to owner `uid`; closed frequency enums; bounded day ranges (1–31) | Firestore rules contract test |
| `users/{uid}/salaryReviews/{id}` | Keyed `income:{incomeId}`; restricted to owner `uid`; immutable audit snapshot | Firestore rules contract test |
| Ghost Mode Compliance | Replaces sensitive salary amounts with `••••••` across hero, timeline, and breakdown | `salary.qa.test.ts` §9 |
| Non-Advisory Disclaimer | Prominent banner stating tracking is informational and does not constitute advice | Displayed on `/salary` |

---

## 5. Offline, Loading, Error & Empty States

| Surface | Loading State | Error State | Empty State | Offline Handling |
|---|---|---|---|---|
| Salary Dashboard (`/salary`) | `DashboardSkeleton` (hero + sections) | `ErrorState` with retry callback | `EmptyState` with CTA to view ledger incomes | Offline writes queue in outbox; toast indicates "saved offline" |
| Header Summary Hero | Shimmer placeholder | Fallback to empty | Displays prompt to link or record income | In-memory cached profile |
| Payslip Waterfall | Shimmer rows | Error alert | Net-only badge when gross is unknown | Cached breakdown facts |
| Irregularity Alerts | Hidden during load | Graceful suppression | Clean empty state without intrusive banners | Cached signals |
| Insights Entry Card | "Checking salary history…" | "Couldn't load salary data" | "Track net salary, deductions & stability" | Fallback copy |

---

## 6. Performance Benchmarks

Measured under Node/Vitest test runner:

| Operation | Benchmark Dataset | Measured Execution Time | Budget Threshold |
|---|---|---|---|
| Salary candidate detection | 2,500 raw transactions | ~70 ms | < 250 ms |
| Paycheck timeline grouping | 1,000 salary records | ~30 ms | < 200 ms |
| Analytics & stability calculation | 1,000 salary records | ~25 ms | < 200 ms |
| Full salary vitest suite | 119 unit & contract tests | ~17.9 s | < 30 s |

---

## 7. Rollout Runbook & Leftovers

### 7.1 Release Prerequisites
- Firestore security rules deployed for `salaryRecords`, `salaryProfiles`, `salaryReviews`.
- Supabase read-model migration `20261110_salary_intelligence.sql` applied.
- Read-model mapping and allowlists registered in `shared/utils/readModel/mapping.ts`.

### 7.2 Post-Merge Checklist
Refer to [docs/AFTER_MERGE_CHECKLIST.md](AFTER_MERGE_CHECKLIST.md) after epic merges to `main`:
1. Rules deploy: `firebase deploy --only firestore:rules`.
2. Supabase migration: verify `rm_client_apply` RPC support for `salaryRecords`, `salaryProfiles`, and `salaryReviews`.
3. Expo & Android build: verify `npx expo export` and run Android device test.
