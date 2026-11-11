# SPENDLY-331: Build Salary Irregularity and Missing-Paycheck Intelligence

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-331](https://kesavach.atlassian.net/browse/SPENDLY-331)  
**Branch:** `feature/SPENDLY-331-salary-irregularity-intelligence` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-331 detects unusual salary timing or amount deviations using the user's personal historical salary data.

### Acceptance Invariants & Design Principles:
1. **Historical Baseline Learning**:
   - `learnPaydayProfile`: Automatically learns typical payment day of month (e.g. 28th–31st or 1st–5th), payment timing (`same_month` vs `next_month`), and baseline net regular salary from historical confirmed regular paychecks.
   - User's `SalaryProfile.expectedPaydayWindow` overrides or tunes the learned window when configured.
2. **"Missing" Definition & Non-Accusatory Tone**:
   - "Missing" strictly means *no detected qualifying credit in the expected window* in the user's linked accounts.
   - It is explicitly **not proof** that an employer failed to pay (could be paid to another account, paid via cheque/cash, bank delay, or job transition).
   - All notifications and descriptions maintain a calm, measured, helpful tone.
3. **Variable Pay Isolation**:
   - Variable pay (bonuses, incentives, reimbursements) is excluded from regular-pay baseline calculations.
   - Receiving standard regular pay in a month following a large bonus will **not** trigger a false "salary drop" alert.
4. **Signal Kinds & Severity**:
   - `late_paycheck`: Expected payday window elapsed by 2–14 days without a credit (Severity: `attention`).
   - `missing_paycheck`: Expected payday window elapsed by > 14 days without a credit (Severity: `warning`).
   - `partial_pay`: Regular credit is $\le 65\%$ of established baseline (Severity: `warning`).
   - `unexpected_decrease`: Regular credit is between $65\%$ and $85\%$ of baseline (Severity: `attention`).
   - `unexpected_increase`: Regular credit is $\ge 125\%$ of baseline (Severity: `info`, prompts user to tag bonus).
5. **Dismissals & Corrections**:
   - Signals are identified with deterministic IDs (`buildSignalId`).
   - Users can dismiss signals with categorized reasons (`changed_jobs`, `paid_other_account`, `cash_or_cheque`, `expected_deduction`, `false_alarm`, `other`).
   - `filterActiveSalarySignals` filters dismissed alerts permanently.
6. **Pure Shared Architecture**:
   - Pure logic in `shared/features/salary/utils/irregularity.ts` (zero React/Firebase dependencies), compiling cleanly under `tsconfig.shared.json`.

---

## 2. Changes Implemented

### Salary Irregularity Engine (`shared/features/salary/utils/irregularity.ts`)
- `learnPaydayProfile`: Derives historical median payment day, window, timing, and baseline regular salary.
- `detectSalaryIrregularities`: Evaluates expected payday window vs reference evaluation date (`todayKey`) and detects timing/amount deviations.
- `filterActiveSalarySignals`: Filters out dismissed signals.
- `buildSalarySignalNotification`: Creates calm, measured push notification copy.
- Re-exported via `shared/features/salary/utils/index.ts`.

### Component Irregularity Alert Card (`components/salary/SalaryIrregularityAlert.tsx`)
- Displays:
  - Severity-tinted alert cards (`warning`, `attention`, `info`).
  - Signal title, employer, wage month, and measured explanation.
  - Expected baseline vs detected credit comparison tile.
  - Contextual action buttons (`Review Paycheck`, `Add Paycheck`, `Tag as Bonus`, `Dismiss`).
  - Interactive dismissal modal with 6 categorized reasons (`SALARY_SIGNAL_DISMISSAL_REASONS`).
- Re-exported via `components/salary/index.ts`.

### Unit Tests (`shared/features/salary/utils/irregularity.test.ts`)
- 11 comprehensive vitest tests covering:
  - Learning expected payday window and baseline amount from history.
  - Learning `next_month` payment timing (1st–5th of next month).
  - Late paycheck signal when window elapsed by 3 days.
  - Missing paycheck signal when window elapsed by > 14 days.
  - Suppression of alerts before payday window closes.
  - Partial pay detection ($\le 65\%$).
  - Unexpected decrease detection ($65\% - 85\%$).
  - Unexpected increase detection ($\ge 125\%$).
  - Variable pay isolation (bonus month does not trigger false decrease in subsequent regular month).
  - Dismissals filtering with deterministic IDs.
  - Notification copy verification.

---

## 3. Verification & Test Results

| Test Suite | Tests | Result |
| :--- | :--- | :--- |
| `shared/features/salary/utils/irregularity.test.ts` | 11 passed | PASS |
| `shared/features/salary/**` (all 9 files) | 97 passed | PASS |
| `shared/utils/readModel/**` (all 8 files) | 174 passed | PASS |
| `npm run typecheck:shared` | 0 errors | PASS |
| `npm run typecheck` | 0 errors | PASS |
