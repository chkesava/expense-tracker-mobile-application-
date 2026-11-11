# Plan: Epic SPENDLY-324 Salary Intelligence, story by story

> **Approved plan for epic SPENDLY-324** (approved 2026-11-10). It is copied from the agent's plan file so every agent works from the same single source of truth.
> The live per-story status is in [SPENDLY-324-salary-intelligence.md](SPENDLY-324-salary-intelligence.md), and the shared rules are in [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).

## Context
[SPENDLY-324](https://kesavach.atlassian.net/browse/SPENDLY-324) builds a Salary Intelligence capability that turns salary credits and employment income into a structured, explainable view of how the user's earnings are changing, how predictable they are, what components make up each paycheck, and how salary changes affect their broader financial picture.

The product answers:
**“What did I actually earn, how has my salary changed, what is driving the change, and how predictable is my income?”**

Product Flow:
**Detect → Understand → Reconcile → Analyze → Forecast → Plan**

## Key Architectural Decisions

### D1: Candidate Review Store vs Canonical Paychecks
- Pure detection engine (`detectSalaryCandidates`) runs deterministically over existing transactions and generates candidate inferences with confidence (`high`, `medium`, `low`) and evidence. Existing transactions are never modified.
- Confirmed salary records and manual salary records live in `salaryRecords` (synced collection).
- User exclusions/decisions on income transactions ("not salary", "bonus", "reimbursement", "different pay period") live in `salaryReviews` (synced collection), keyed deterministically `income:{id}`. Once rejected or reviewed, the detection engine never surfaces that transaction as regular salary again.

### D2: India-First Payroll Semantics & EPF Remittance Cycle Integration
- **Gross vs Net Distinction**: Bank credits are strictly **Net Pay** (take-home salary). Gross pay, EPF deductions, TDS, and Professional Tax cannot be fabricated without supporting evidence.
  - When only the bank credit exists, gross salary and missing deductions are shown as `unknown`, never defaulted to 0 or estimated.
  - When the user has Tax & ITR Readiness (`shared/features/tax`), Form 16 / TDS records are linked to provide official TDS deduction facts.
- **EPF Statutory Remittance Cycle (`shared/features/epf`)**:
  - In India, an employee's salary for wage month `M` (e.g., September) is credited around month-end (Sep 30 / Oct 1), with employee PF deducted on the payslip.
  - By statutory mandate under the EPF Act, the employer remits the PF contribution to EPFO **within 15 days of the close of the month** (by the 15th of month `M+1`, e.g., October 15th), and the deposit reflects in the EPFO passbook within the window of 15th–25th of month `M+1`.
  - **Existing System Reuse**: We directly leverage `expectedCreditWindow(wageMonth)` and `statutoryDueDate(wageMonth)` from `shared/features/epf/utils/schedule.ts` and `findEpfCreditWindowRule` from `shared/features/epf/data/epfCreditWindow.ts`.
  - **Salary Breakdown & EPF Status Linkage**:
    - For a salary record for wage month `M`:
      1. Sourced Employee PF share (12% of basic) is displayed in the deduction breakdown.
      2. Status badge is attached to the deduction row:
         - *Awaiting deposit*: "Statutory deposit to EPFO expected by {statutoryDueDate} (window: {window.from} – {window.to})".
         - *Deposited*: "Deposited to EPFO on {creditDate}".
         - *Overdue*: "Deposit to EPFO past expected window (due {statutoryDueDate})".
      3. Deep link to EPF establishment view `/epf/{establishmentId}`.

### D3: Financial Calendar & Notifications Architecture Recommendations
- **Reuse Infrastructure**: Reuses `SPENDLY-176` (Financial Calendar) and `SPENDLY-222` (Notifications).
- **Calendar Event Model (`shared/types/calendar.ts`)**:
  - Add `"salary"` to `CALENDAR_SOURCES`.
  - Direction: `"in"` (represents actual liquid bank cash inflow, distinct from EPF which is `"neutral"` as it credits retirement asset balances).
  - Lifecycle States:
    - `actual`: Received salary credit from confirmed or detected transaction (`openState(date, today, "actual")`).
    - `expected`: Next expected payday derived from employer profile / historical payday clustering (`openState(date, today, "expected")`).
    - `overdue`: When today is past the expected payday window without an observed salary credit (`today > expectedPaydayWindow.endDay`), priority raised to 2.
  - Deep Link: `href: "/salary?focus={id}"`.
- **Calendar Dual Narrative (Salary vs EPF)**:
  - Day 30/31 of Month M: Salary Paycheck Event (`source: "salary"`, `direction: "in"`).
  - Day 15 of Month M+1: Associated EPF Statutory Remittance Event (`source: "epf"`, `direction: "neutral"`, `subtitle: "Wage month M"`).
- **On-Device Notification Planning (`shared/utils/calendarNotifications.ts`)**:
  - Add to `CalendarNotificationPrefs`:
    - `salaryEnabled: boolean` (default: `true`)
    - `salaryDaysBefore: 0 | 1 | 3` (default: `1` day before)
    - `salaryIrregularityEnabled: boolean` (default: `true`)
  - Copy rules:
    - `before` (1 day prior): `"Tomorrow is your expected payday from {employer}"` (body: `"Expected tomorrow · ₹{netAmount}"`).
    - `due` (day of): `"Payday: {employer}"` (body: `"Salary expected today · ₹{netAmount}"`).
    - `overdue`: `"Pending salary: {employer}"` (body: `"No salary credit detected yet for this pay period"`).

## Stories
| # | Story | Summary | Scope | Dependencies |
|---|---|---|---|---|
| 1 | [SPENDLY-325](https://kesavach.atlassian.net/browse/SPENDLY-325) | Define salary domain model, payroll periods and provenance | Domain types, Zod schemas, Firestore rules + tests, Supabase migration, mapping & allowlist | None |
| 2 | [SPENDLY-326](https://kesavach.atlassian.net/browse/SPENDLY-326) | Build salary detection and payroll transaction recognition | Detection engine, India-first normalization, payday clustering, candidate scoring | 325 |
| 3 | [SPENDLY-327](https://kesavach.atlassian.net/browse/SPENDLY-327) | Build salary review, confirmation and correction workflow | Review/override store, confirmation/rejection workflow, correction history | 325, 326 |
| 4 | [SPENDLY-328](https://kesavach.atlassian.net/browse/SPENDLY-328) | Build salary history and paycheck timeline | Monthly timeline view model, net vs gross history, variable pay indicators | 325, 327 |
| 5 | [SPENDLY-329](https://kesavach.atlassian.net/browse/SPENDLY-329) | Build salary breakdown and deduction analysis | Breakdown waterfall, EPF remittance schedule linkage, Tax TDS integration | 325, 328 |
| 6 | [SPENDLY-330](https://kesavach.atlassian.net/browse/SPENDLY-330) | Build salary trend, growth and stability analytics | MoM/YoY growth, stability coefficient ($CV = \sigma / \mu$), salary baseline metrics | 328 |
| 7 | [SPENDLY-331](https://kesavach.atlassian.net/browse/SPENDLY-331) | Build salary irregularity and missing-paycheck intelligence | Payday window evaluation, delayed/missing credit signals, unexpected variation alerts | 326, 328, 330 |
| 8 | [SPENDLY-332](https://kesavach.atlassian.net/browse/SPENDLY-332) | Build salary forecast and expected-income planning | Conservative expected salary date & net income forecasting, disclosures, disclaimers | 328, 330 |
| 9 | [SPENDLY-333](https://kesavach.atlassian.net/browse/SPENDLY-333) | Integrate salary events with Financial Calendar and notifications | Calendar source adapter (`source: "salary"`), expected payday events, notification planning | 328, 331, 332 |
| 10 | [SPENDLY-334](https://kesavach.atlassian.net/browse/SPENDLY-334) | Build Salary Intelligence dashboard and financial context insights | Screen `/salary`, navigation registration, overview cards, timeline, insights | 327–333 |
| 11 | [SPENDLY-335](https://kesavach.atlassian.net/browse/SPENDLY-335) | Salary Intelligence QA, privacy, accuracy, performance and rollout | Integration QA, cross-user privacy tests, performance benchmarks, rollout documentation | 325–334 |
