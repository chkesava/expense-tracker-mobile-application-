# SPENDLY-330: Build Salary Trend, Growth and Stability Analytics

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-330](https://kesavach.atlassian.net/browse/SPENDLY-330)  
**Branch:** `feature/SPENDLY-330-salary-trend-growth-analytics` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-330 builds comprehensive analytics showing how salary and employment income have evolved over time across months and employers, providing month-over-month growth, annual growth, variable-pay composition, statistical stability metrics, and rolling baseline comparisons.

### Acceptance Invariants & Design Principles:
1. **Confirmed / Canonical Source Records**:
   - By default (`canonicalOnly: true`), changes and growth metrics are calculated strictly from confirmed or manually created salary records (`status === "confirmed" | "manual"`), avoiding premature distortion from unreviewed inferences.
2. **Transparent Handling of Insufficient History**:
   - MoM requires 2 consecutive months of data. If the prior month is missing, `hasPreviousData: false` is returned with an explicit reason (`insufficientHistoryReason`).
   - YoY requires data for the same month 12 months ago (`shiftMonthKey(month, -12)`). If unavailable, `hasLastYearData: false` is returned with a clear requirement message.
   - Stability requires at least 3 regular paychecks.
3. **Variable Pay Isolation**:
   - Bonuses, incentives, reimbursements, and arrears are tracked and analyzed independently from regular base salary.
   - Base pay trend reflects genuine compensation adjustments and is never distorted by one-off festival or performance bonuses (e.g. an October Diwali bonus does not produce a false +200% base jump followed by a -67% crash).
4. **Income Stability & Variance Index**:
   - Evaluates the Coefficient of Variation ($CV = \frac{\sigma}{\mu}$) across regular monthly paychecks:
     - `high_stability` ($CV \le 5\%$): Highly predictable fixed salary.
     - `moderate_stability` ($5\% < CV \le 20\%$): Normal slight variation (overtime, minor shift diffs).
     - `variable_income` ($CV > 20\%$): Significant fluctuations (commission, consulting, frequent changes).
     - `insufficient_data`: Fewer than 3 regular paychecks.
5. **Factual Explanations & Zero Career Conjectures**:
   - Every metric carries a human-readable `explanation` string defining the formula, sample size, and compared figures.
   - Strictly factual financial metrics: **no job performance, promotion, appraisal, or career conclusions** are inferred.
6. **Pure Shared Architecture**:
   - Pure logic in `shared/features/salary/utils/analytics.ts` (zero React/Firebase dependencies), compiling cleanly under `tsconfig.shared.json`.

---

## 2. Changes Implemented

### Salary Analytics Engine (`shared/features/salary/utils/analytics.ts`)
- `buildSalaryAnalytics`: Groups eligible records by calendar month, isolates regular from variable pay, computes MoM and YoY comparisons, calculates standard deviation and Coefficient of Variation, computes 3/6/12-month rolling baselines, and generates explanatory insights.
- Re-exported via `shared/features/salary/utils/index.ts`.

### Component Trend Card (`components/salary/SalaryTrendCard.tsx`)
- Responsive card displaying:
  - Header with target month and stability badge.
  - Top 3 metric tiles: Base MoM growth, Annual YoY growth, and Stability Index.
  - Income stream composition progress bar and legend (Base vs Bonus / Variable).
  - 6-month rolling baseline comparison box.
  - Recent monthly history list (last 6 months) with selectable months.
  - Factual financial observations / insights list.
  - Privacy and non-appraisal disclaimer footnote.
- Re-exported via `components/salary/index.ts`.

### Unit Tests (`shared/features/salary/utils/analytics.test.ts`)
- 9 comprehensive vitest tests covering:
  - MoM percentage and absolute growth from confirmed records.
  - Default `canonicalOnly` filter excluding unreviewed detected transactions.
  - Variable pay isolation preventing bonus distortion.
  - Insufficient history handling for MoM and YoY.
  - YoY calculation across a 12-month span.
  - Statistical stability classification (`high_stability`, `variable_income`, `insufficient_data`).
  - Rolling 3-month and 6-month baseline variance calculations.
  - Employer-specific analytics filtering.

---

## 3. Verification & Test Results

| Test Suite | Tests | Result |
| :--- | :--- | :--- |
| `shared/features/salary/utils/analytics.test.ts` | 9 passed | PASS |
| `shared/features/salary/**` (all 8 files) | 86 passed | PASS |
| `shared/utils/readModel/**` (all 8 files) | 174 passed | PASS |
| `npm run typecheck:shared` | 0 errors | PASS |
| `npm run typecheck` | 0 errors | PASS |
