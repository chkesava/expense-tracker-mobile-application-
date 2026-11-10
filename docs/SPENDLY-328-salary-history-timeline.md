# SPENDLY-328: Build Salary History and Paycheck Timeline

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-328](https://kesavach.atlassian.net/browse/SPENDLY-328)  
**Branch:** `feature/SPENDLY-328-salary-history-timeline` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-328 provides a comprehensive, structured timeline of salary paychecks and income history across calendar months and employers.

### Key Capabilities:
1. **Reconciliation with Canonical Records**:
   - Accurately aggregates and displays confirmed and detected `SalaryRecord` entries.
   - Shows pay date (`YYYY-MM-DD`), wage period / month (`YYYY-MM`), employer name, and account reference.
2. **Net vs Gross Pay Distinction**:
   - Net pay credited to bank is always visible and strictly positive.
   - Gross pay is displayed when reported by the user or payslip breakdown.
   - **Acceptance Invariant**: Missing gross pay is represented as `null` / `"Not specified"` rather than `₹0`.
3. **Variable Pay Visual & Numerical Separation**:
   - Identifies bonuses, incentives, reimbursements, stipends, and severance (`isVariablePay = classification !== "regular"`).
   - Separates regular monthly salary from variable income in all monthly group totals and top-level summary metrics.
4. **Missing Paycheck Gap Detection**:
   - Detects calendar months within an employment sequence with zero regular salary credits.
   - Surfaces gaps as missing paycheck warning cards with `netAmount: undefined` (unknown, never zero!).
5. **Interactive Filtering**:
   - Multi-year filters (`All Years`, `2026`, `2025`...).
   - Classification filters (`All Types`, `Regular`, `Bonus / Variable`).
   - Employer filters (for users with multiple employers or job transitions).
6. **High Performance & Scale**:
   - Pure, deterministic in-memory computation processing 1,000+ salary records in < 30ms.
7. **Presentational Timeline Component (`PaycheckTimeline.tsx`)**:
   - Displays summary metrics card (Total Net, Regular Pay, Variable Pay, Monthly Average, Missing Paychecks alert).
   - Filter chips bar.
   - Monthly groups with month headers, paycheck cards, gross pay indicators, breakdown links, and empty states.

---

## 2. Changes Implemented

### Pure Timeline Engine (`shared/features/salary/utils/timeline.ts`)
- `formatMonthName`: Formats `YYYY-MM` into friendly strings (e.g. `"October 2026"`).
- `buildSalaryTimeline`: Transforms `SalaryRecord[]` into `MonthlyPaycheckGroup[]`, identifies missing paycheck sequence gaps via `monthKeysBetween`, applies filters, and computes `SalaryTimelineSummary`.
- Barrel export added to `shared/features/salary/utils/index.ts`.

### Timeline Unit Tests (`shared/features/salary/utils/timeline.test.ts`)
- 9 comprehensive tests validating:
  - Canonical reconciliation and monthly grouping.
  - Missing data represented as null/unknown rather than zero.
  - Variable pay separation.
  - Missing paycheck gap detection between recorded months.
  - Year, employer, and classification filters.
  - Performance benchmark (1,000 records in < 30ms).

### UI Timeline Component (`components/salary/PaycheckTimeline.tsx`)
- Interactive, responsive component displaying:
  - Total Net Salary Received.
  - Regular vs Variable Pay metric columns.
  - Average Monthly Net Pay.
  - Reported Gross Pay total (omitted if unknown).
  - Missing Paychecks warning banner.
  - Filter chips.
  - Month groups and paycheck cards with deep links to review modal.

---

## 3. Verification & Test Results

| Test Suite | File | Tests | Result |
| :--- | :--- | :--- | :--- |
| **Salary Timeline Engine** | `shared/features/salary/utils/timeline.test.ts` | 9 | ✅ Passed |
| **Salary Review Utilities** | `shared/features/salary/utils/review.test.ts` | 9 | ✅ Passed |
| **Salary Store Actions** | `services/salary/salaryStore.test.ts` | 7 | ✅ Passed |
| **Salary Detection Engine** | `shared/features/salary/utils/detectSalary.test.ts` | 12 | ✅ Passed |
| **Payroll Normalization** | `shared/features/salary/utils/payrollNormalize.test.ts` | 20 | ✅ Passed |
| **Salary Domain Builders** | `shared/features/salary/utils/builders.test.ts` | 7 | ✅ Passed |
| **Salary Rules Contract** | `shared/features/salary/salaryRules.contract.test.ts` | 5 | ✅ Passed |
| **Total Salary Feature Tests** | Combined run | **69** | ✅ **69/69 passed (100%)** |
| **Read Model Mapping Guard** | `shared/utils/readModel/mapping.test.ts` | 105 | ✅ Passed |
| **Firestore Cross-User Indexes** | `scripts/readmodelCrossUserIndexes.test.ts` | 166 | ✅ Passed |
| **Read Model Write Hooks** | `lib/readModelWriteHooks.test.ts` | 8 | ✅ Passed |
| **Read Model Provider Switch** | `lib/readModelLocal/providerSwitch.test.ts` | 66 | ✅ Passed |
| **Read Model Listeners Guard** | `lib/readModelLocal/listenersOff.test.ts` | 4 | ✅ Passed |
| **Shared Package Typecheck** | `npm run typecheck:shared` | - | ✅ **0 errors** |
| **Root Project Typecheck** | `npm run typecheck` | - | ✅ **0 errors** |

---

## 4. Manual Testing Guide

1. **Monthly Paycheck Grouping**:
   - Render `<PaycheckTimeline records={records} />`.
   - Verify paychecks are grouped under their wage month (e.g. "October 2026").
2. **Variable Pay Separation**:
   - Add a bonus record and a regular record in the same month.
   - Verify the bonus has a "BONUS" badge and its amount contributes to "Variable / Bonus" while the regular record contributes to "Regular Pay".
3. **Missing Gross Pay Representation**:
   - View a paycheck without gross pay.
   - Verify it displays "Gross Pay: Not specified" rather than "₹0".
4. **Missing Paycheck Detection**:
   - Provide records for July and September but omit August.
   - Verify a "Missing Paycheck" card is rendered under August with an alert icon and no numeric amount.
5. **Filters**:
   - Toggle year chips (`2026`, `2025`) and classification chips (`Regular`, `Bonus`).
   - Verify list updates immediately in memory without screen flicker.
