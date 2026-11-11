# SPENDLY-329: Build Salary Breakdown and Deduction Analysis

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-329](https://kesavach.atlassian.net/browse/SPENDLY-329)  
**Branch:** `feature/SPENDLY-329-salary-breakdown-analysis` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-329 provides detailed component breakdown and deduction analysis for salary paychecks whenever component or payslip data is available.

### Acceptance Invariants & Design Principles:
1. **Source-Supported Components Only**:
   - Only source-supported components (Basic, HRA, Special Allowance, Other Allowance, Variable Pay, EPF, TDS, Professional Tax, Other Deductions) are displayed as facts.
   - Missing components are never fabricated (missing is `null` or omitted, never assumed `0`).
2. **Derived Values Explicitly Labeled**:
   - Values derived at display time (e.g. gross pay derived from summing itemized earnings when gross was not explicitly provided) carry `isCalculated: true` and are rendered with a `Calculated` badge.
3. **Mathematical Reconciliation Waterfall**:
   - Compares: `Gross Salary (or itemized earnings) + Variable Pay - Total Deductions` with `Net Salary`.
   - `reconciled`: Exact or within ₹1 rounding difference. Displays green `✓ Reconciled` badge.
   - `discrepancy`: Mathematical diff detected. Displays amber `⚠️ Discrepancy` alert explaining the exact variance.
   - `partial`: Gross and Net are known, but allowances or deductions are not fully itemized.
   - `net_only`: Only bank credit is captured. Shows friendly fallback state with action to enter payslip details.
4. **India Statutory EPF Remittance Integration**:
   - For wage month `M` (e.g. `2026-10`), EPFO statutory due date is the 15th of month `M+1` (`2026-11-15`), with employer grace window running to the 25th (`2026-11-25`).
   - Reuses statutory schedule logic from `@/shared/features/epf/utils/schedule` (`statutoryDueDate` & `expectedCreditWindow`).
   - Cross-references paycheck with EPF passbook contributions:
     - `deposited`: Passbook credit verified in EPF ledger.
     - `awaiting_deposit`: Within statutory due date or grace window ("Statutory deposit expected by {statutoryDueDate}").
     - `overdue`: Today is past the grace window without confirmed passbook credit.
     - Deep-links directly to `/epf/[establishmentId]` or `/investments?tab=epf`.
5. **Income Tax (TDS Section 192) Integration**:
   - Analyzes Section 192 TDS deductions under current Indian tax law.
   - Automatically maps payment date / wage month to Indian Financial Year (e.g. `FY 2026-27`).
   - Deep-links directly to Tax Center (`/tax/[fy]/tds` or `/tax`) for Form 26AS/AIS reconciliation.
6. **Pure Shared Architecture**:
   - Engine in `shared/features/salary/utils/breakdown.ts` is 100% pure TypeScript (zero React/Firebase dependencies), compiling cleanly under `tsconfig.shared.json`.

---

## 2. Changes Implemented

### Breakdown & Deduction Engine (`shared/features/salary/utils/breakdown.ts`)
- `buildSalaryBreakdownWaterfall`: Generates complete `SalaryBreakdownWaterfall` with source facts, reconciliation status, and statutory linkages.
- `analyzeEpfDeduction`: Evaluates EPF deduction against EPFO statutory remittance calendar and matched ledger contributions.
- `analyzeTaxDeduction`: Evaluates Section 192 TDS deduction and maps to Indian Financial Year.
- Re-exported via `shared/features/salary/utils/index.ts`.

### Component Breakdown Card (`components/salary/SalaryBreakdownCard.tsx`)
- Displays:
  - Header: Employer, wage month, payment date, and reconciliation badge.
  - 3-column top summary: Gross Pay, Deductions, and Net Take-Home.
  - Discrepancy alert box when mathematical mismatch is detected.
  - Earnings & Allowances itemized list (Basic, HRA, Special, Variable Pay).
  - Deductions list with integrated EPF statutory badge and Tax Center deep-links.
  - Net-only fallback card with "Add Payslip Details" button.
- Re-exported via `components/salary/index.ts`.

### Unit Tests (`shared/features/salary/utils/breakdown.test.ts`)
- 15 comprehensive vitest tests covering:
  - Full waterfall with reconciled totals.
  - Non-fabrication of missing earnings or deductions.
  - Calculated gross when derived from allowances.
  - Mathematical discrepancy detection.
  - Partial breakdown handling.
  - Net-only records (bank SMS capture).
  - EPF statutory deposit schedule (before due date, in grace window, overdue, verified passbook deposit, missed contribution, and non-EPF paychecks).
  - Section 192 TDS tax analysis and financial year mapping.

---

## 3. Verification & Test Results

| Test Suite | Tests | Result |
| :--- | :--- | :--- |
| `shared/features/salary/utils/breakdown.test.ts` | 15 passed | PASS |
| `shared/features/salary/**` (all 7 files) | 77 passed | PASS |
| `shared/utils/readModel/**` (all 8 files) | 174 passed | PASS |
| `npm run typecheck:shared` | 0 errors | PASS |
| `npm run typecheck` | 0 errors | PASS |
