# SPENDLY-334: Build Salary Intelligence Dashboard and Financial Context Insights

## 1. Overview
SPENDLY-334 delivers the complete user-facing **Salary Intelligence** dashboard and contextual financial linkages within the Spendly application. It aggregates all salary intelligence capabilities created across Stories 1 through 9 (SPENDLY-325 through SPENDLY-333) into a cohesive, interactive, and transparent experience.

## 2. Key Components Delivered

### 2.1 Route & Entry Point
- **Route**: `app/(app)/salary/index.tsx` registered in `app/(app)/_layout.tsx` with smooth slide-from-right animation.
- **Insights Hub Entry Card**: `components/salary/SalaryInsightsEntryCard.tsx` embedded in `app/(app)/insights.tsx` under the Analytics tab. Displays the current monthly regular net pay, primary employer, next expected payday, or pending candidate count.

### 2.2 Dashboard Core Architecture (`app/(app)/salary/index.tsx`)
- **Page Header**: Distinctive branding with icon, page title, subtitle, back navigation, and data refresh button.
- **Empty & Loading States**:
  - `EmptyState`: Informative empty screen when no salary credits are recorded or detected, with direct call-to-action to review ledger incomes.
  - `DashboardSkeleton`: Shimmer loading state during initial Firestore and read-model query execution.
  - `ErrorState`: Friendly retryable error display.
- **Irregularity & Anomaly Banners**:
  - `SalaryIrregularityAlert`: Displays active alerts for missing paychecks, delayed deposits, or unexpected amount variations with dismissal reason actions.
- **Hero Header Summary**:
  - `SalaryHeaderSummary`: Displays the latest regular net pay, gross pay badge, employer name, wage period, 12-month cumulative bonus tally, and pending candidate review prompt.
- **Expected Payday Horizon**:
  - `SalaryForecastCard`: Visualizes expected payday date, confidence tier, window intervals, and 6-month projected paycheck amounts. Offers quick action to view Financial Calendar.
- **Deduction & Payslip Waterfall**:
  - `SalaryBreakdownCard`: Interactive waterfall showing Gross Salary, Basic Pay, HRA, EPF statutory deductions, Section 192 TDS, Professional Tax, and final Net Pay. Supports editing payslip details.
- **Trend, Growth & Stability**:
  - `SalaryTrendCard`: Analyzes MoM base salary trajectory, 6-month and 12-month rolling trends, and volatility tier (Very High, Stable, etc.).
- **Broader Financial Context Insights**:
  - `SalaryFinancialContextCard`: Bridges salary intelligence to:
    1. **Budget vs Income Ratio**: Compares active monthly budget to monthly net pay with percentage gauge and unallocated savings buffer.
    2. **EPF Statutory Contribution**: Links employer EPF deductions to the user's EPF establishment ledger.
    3. **Tax & ITR Readiness**: Direct linkage to Section 192 TDS and Form 16 reconciliation.
    4. **Financial Calendar Payday Integration**: Highlights synchronized payday reminders.
    5. **Non-Advisory Disclaimer**: Prominently informs the user that figures are based solely on confirmed transaction data and user inputs, and do not constitute legal, tax, or employment advice.
- **Paycheck Timeline**:
  - `PaycheckTimeline`: Chronological grouped monthly ledger of all historical paychecks, with type pills (`Regular`, `Bonus`, `Incentive`, `Reimbursement`), amount badges, and interactive selection to inspect or edit any past record.
- **Review & Correction Workflow**:
  - `SalaryReviewModal`: Seamless modal handling candidate confirmation, overrides, payslip corrections, and rejections.

## 3. Data Flow & Hooks
- `useSalaryIntelligenceData`: Unified composite hook coordinating `useSalaryRecords`, `useSalaryProfiles`, `useSalaryReviews`, and `useIncomes` with automatic detection and forecasting.
- `useSalaryReviewActions`: Encapsulates `confirm`, `reject`, `correct`, `remove`, and bulk operations using `commitMutations` -> on-device outbox -> Supabase read model.
- `useSalaryReviews`: Reactive listener for user review overrides and decisions.

## 4. Verification & Testing
- Vitest suite covers salary rules, detection, timeline, breakdown, analytics, irregularity, and forecast.
- Shared TypeScript configuration (`tsconfig.shared.json`) cleanly verified with 0 errors.
- Strict adherence to Spendly design tokens, color palette, surface translucency, and accessibility guidelines.
