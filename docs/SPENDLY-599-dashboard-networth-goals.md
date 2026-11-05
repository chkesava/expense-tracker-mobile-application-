# SPENDLY-599: dashboard, net worth, budgets, safe-to-spend and goals read through the switch

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-599-dashboard-networth-budgets` |
| Migration | none |

The highest-risk screens: what the user acts on. Each collection has its own switch, `readModel.<collection>`: firestore (the default), then shadow for **14 days**, then supabase. The default changes nothing.

## What reads through the switch

| Screen | Source | Where |
|---|---|---|
| **Dashboard tiles** (current and previous month), cash-flow chart, budgets, the inbox month | `financialSummaries` `dashboard_*`: the exact copies 592 made, `categoryTotals` included (the row's full document) | `useDashboardCashFlow` |
| **EPF value** in net worth and runway | `financialSummaries/epf` | `useEpfSummary({ readFrom: "copy" })` from `useEpfNetWorth` |
| **Net worth** | `composeNetWorth` over its inputs (ADR D3: no stored authoritative net-worth document). Accounts (597), portfolio (598), borrowings and receivables (673) and the EPF summary all follow their own switches | `useUnifiedNetWorth` (unchanged) |
| **Net-worth history** | `netWorthHistory`, the last 12 months | `useNetWorthHistory` |
| **Budgets and alerts** | `categoryBudgets` (673) and the tiles' `categoryTotals`, through the existing helpers | unchanged |
| **Safe-to-spend** | the existing helpers over inputs that are already switched | unchanged |
| **Goals** | `financialGoals` | `ExpenseReferenceDataProvider` |

**A just-saved expense:** the copy layers this device's outbox on top (670). The outbox entry is the summary document that Firestore's local cache holds right after the write, so the tiles move at once. They match Firestore after the dual write.

## Writers that write from these reads (R4.3a, "read Firestore for the write")

| Writer | What it does when its inputs come from the copy |
|---|---|
| **EPF summary sync** (653) | Compares with the stored summary and writes. It calls `useEpfSummary()` without the opt-in, so it always reads Firestore |
| **The daily net-worth point** (568/620) | `confirmSnapshotOnFirestore` reads today's month document from the server; if today is already there, it doesn't write. It also reads each copy-served input of the totals from the server, and the copy must match it exactly (`copyAgreesWithFirestore`, the shadow comparison). Inputs: accounts, account types, investments, holdings, investment cash, borrowings and receivables with their repayments, and the EPF summary. Otherwise the card keeps saying "Saving…" and tries again in a minute. Ledger collections aren't checked: they only raise the non-blocking "may be partial" flag |
| **Goal writes** (606/613) | Built from Firestore's goals: one `getDocs` per write, Firestore's local view with pending writes included, as the listener showed before. The rules still refuse a change built on a stale goal |

**Goals' "waiting to sync"** (613): from the copy, these are the goals with a write this device hasn't sent yet (its outbox), the same as 596 does for the Journal.

**Stays on Firestore:** `lib/summaryMonthStore.ts` (the drill-downs' one-off month reads) and the EPF summary sync.

## Tests

- **`lib/readModelLocal/verifyCopy.test.ts`** (new):
  - with no input from the copy, nothing is read;
  - every copy-served input matches: write;
  - a missing, extra or differing row refuses;
  - cache data or a failure refuses;
  - a copy that isn't ready refuses;
  - a one-document check ignores the copy's other rows;
  - it stops at the first difference.
- **`lib/readModelLocal/providerSwitch.test.ts`:**
  - `financialSummaries`, `netWorthHistory` and `financialGoals` are integrated, with the same safe-switch checks as every other collection;
  - pins: the EPF summary sync reads Firestore; the recorder confirms before writing and checks every input of the totals with server data only; goal writes are built from Firestore's goals.

## Results

- `npx vitest run`: 538 files, 7,652 tests pass.
- `npx tsc --noEmit -p .` passes.
- `npm run test:rules` passes.

## After the epic reaches main

- **Shadow:** 14 days with zero differences on every tile value, then the user approves each flip. Health's Free-plan capacity rows must be green (595).
- **Flip order:**
  1. `financialSummaries` and `netWorthHistory`;
  2. `financialGoals` last, after checking "waiting to sync" on a device.
- **Drill:** with `financialSummaries` on supabase, save an expense offline. The tile moves at once, and after reconnecting it matches Firestore.
