# SPENDLY-598: investments, EPF, loans and subscriptions read through the switch

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-598-investments-epf` |
| Migration | none |

Each collection has its own switch, `readModel.<collection>`: firestore (the default), then shadow, then supabase (SPENDLY-673). The default changes nothing.

## What reads through the switch

| Area | Collections | Where | Writes from these reads (R4.3a) |
|---|---|---|---|
| Investments and FDs | `investments` | already in 673 | — |
| Borrowings and receivables | `borrowings`, `receivables` and their repayments | already in 673 (668: a missing `sourceMode` compares as `account`) | — |
| Portfolio | `holdings`, `investmentCashTransactions`, `portfolioSettings`, `portfolioTransactions` | `usePortfolio` | **The daily snapshot:** in copy mode, it writes only if Firestore holds the same holdings (`holdingsFingerprint`); otherwise it skips and retries later |
| SIP | `sipPlans`, `virtualPositions`, `sipTransactions` | `useSips` | SIP execution already reads its plans and positions from Firestore |
| Subscriptions | `subscriptions` | `ExpenseReferenceDataProvider` | **Auto-posting:** plans on the copy; only if something is due, it re-reads them from Firestore (server data only) and re-plans before posting |
| Watchlists (624) | `watchlists`, `watchlists/items` (nested) | `useWatchlists` | **Setup:** confirms on the server that there are no lists before writing. Quotes stay on the market functions |
| EPF passbook | `epfContributions`, `epfEstablishments`, `epfInterestEntries` | the EPF hooks, **only for callers that pass `readFrom: "copy"`** | see below |

## EPF: the copy serves only display-only callers

Almost every EPF screen writes from what its hooks loaded:
- the dashboard's catch-ups (contributions, interest) and the summary sync (653);
- the Balance tab, which recomputes interest whenever the ledger changes;
- status changes, backfill saves and discarding drafts, which work from the loaded months.

So each EPF hook reads Firestore unless its caller opts in. `useReadModelSource(collection, { copy: false })` may still compare (shadow) but never reads the copy.

**Callers that opt in:** they never write, which the guard checks.

| Caller | Reads |
|---|---|
| `EpfContributionHistory` (the passbook) | one establishment's months, interest entries |
| `EpfCurrentMonthCard` | one establishment's months |
| `useFinancialCalendar` | all months, establishments |

**Stays on Firestore:** `epfTransfers`, `epfReconciliations`, `epfWageHistory` and `epfProfile`. Every caller of these writes from them.

The stored EPF summary (`financialSummaries`) is 599's.

## Tests

`lib/readModelLocal/providerSwitch.test.ts`:
- **Integrated collections:** exactly the expected list. Each keeps its Firestore listener, reads the copy only in supabase mode, compares only in shadow mode, and re-runs on a mode change.
- **Writer pins:** the portfolio snapshot, subscription auto-posting, watchlist setup and SIP execution.
- **EPF hooks:** each passes `{ copy: options?.readFrom === "copy" }`.
- **EPF opt-ins:** exactly the three callers above, and none of them takes an EPF writer.

`readSource.test.ts`: nested rows (`parentId`) for watchlist items.

## Results

- `npx vitest run`: 537 files, 7,636 tests pass.
- `npx tsc --noEmit -p .` passes.

## After the epic reaches main

Per collection: firestore, then shadow for 14 days with zero differences to the paisa or unit, then supabase. Health's Free-plan capacity rows must be green before each flip (595).

- **Before turning on subscriptions:** check `readModel.shadow.subscriptions`.
- **For EPF:** the shadow compares one establishment's rows (`windowed`). Extra rows don't count; missing or different rows do.
