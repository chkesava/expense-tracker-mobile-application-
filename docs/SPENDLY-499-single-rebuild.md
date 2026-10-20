# SPENDLY-499: one rebuild implementation, working status flags, retired summary docs

[SPENDLY-499](https://kesavach.atlassian.net/browse/SPENDLY-499) is a standalone task, P1-1/P1-2 in the 2026-10-11 audit. It is the fourth item of the correctness track (495 → 496 → 497 → 499 → 500 → 503).

Branch: `fix/SPENDLY-499-single-rebuild`, cut from `main` `37fbbde`.

## User decision (2026-10-20)

**Retire `financialSummaries/netWorth` and `/investments`.** Nothing read them, and they disagreed with what the app shows: they left out stock values, FDs and quotes. Net worth now has one definition, `composeNetWorth`, computed live. The old docs stay in Firestore, unused.

## Before → after

| Problem | Before | After |
|---|---|---|
| Three rebuild implementations | In-app, `rebuild-financial-summaries.ts` and `rebuild-domain-summaries.ts` each computed balances their own way | One pure reference in `shared/utils/reconciliation.ts`:<br>• `planAccountRebuild` (one account);<br>• `recomputeFinancialState` (one user: accounts, EPF, dashboards);<br>• `accountRebuildWrite` (the exact field map).<br>The in-app rebuild calls them directly. Both scripts are now thin entry points over **one runner**, `scripts/lib/rebuildRunner.ts`. `calculateAccountBalances` remains as a wrapper over `planAccountRebuild` |
| Flags never cleared | An account flagged `needs_reconciliation` whose value was right was never written. The in-app rebuild only set `balanceReconciliationStatus` | A flagged account is always written. **Both** status fields become `healthy`, and `lastReconciledAt` is stamped |
| Partial data marked healthy | — | A failed source read throws (in-app) or skips the user (scripts). Nothing is written on partial data |
| Scripts missed some users | `collection("users").get()` skipped uids with no root doc | `listDocuments()` (proven on the emulator with a root-less user) |
| Batch overflow | One batch per user, no limit | `ChunkedBatch` commits every 450 operations |
| Timestamp types | App wrote a Timestamp, script an ISO string | `serverTimestamp` everywhere, via `accountRebuildWrite` |
| Write-only summary docs | `buildNetWorthOps` / `buildInvestmentSummaryOps` ran on every bank, card, EPF and investment write; the domain script rebuilt `netWorth` with `quotes: new Map()` and `investmentCashBalance: 0` | Removed:<br>• the writers: `netWorthMutations.ts`, `investmentMutations.ts`, the net-worth part of `buildAccountBalanceOps` and `epfMutations`, and 5 investment-cash call sites;<br>• the unused hooks `useNetWorthSummary` and `useInvestmentsSummary`;<br>• the types;<br>• the script step.<br>The EPF summary (which **is** read) stays |

## Tests

| Test | What it proves |
|---|---|
| `shared/utils/rebuildReference.test.ts` (6) | On a fixture covering every flow kind, `recomputeFinancialState`, `planAccountRebuild` and `calculateAccountBalances` agree. Flag transitions: a flagged-but-correct account is written with both statuses healthy; a clean account isn't written. `accountRebuildWrite` gives one field map. No net-worth output |
| `services/ledger/rebuildFinancialSummaries.test.ts` (4) | The in-app rebuild writes **exactly** `accountRebuildWrite(planAccountRebuild(…))` for a bank and a card; it clears a flag on an already-correct account; dry-run writes nothing |
| `scripts/rebuildRunner.test.ts` (5) | `listDocuments` includes root-less uids. 1,000 writes commit as 450 + 450 + 100. Dry-run writes nothing. A failed read skips the user. The retired docs are never written |
| `scripts/retiredSummaries.test.ts` (1) | No app, service or script code references `financialSummaries/netWorth` or `/investments`, or the removed builders |
| Updated: `debtBalanceOps.test.ts`, `investmentCash.test.ts` | They now assert that the retired docs are **not** written |
| **Emulator run** (manual, 2026-10-19/20) | Seeded demo data, 4 flagged accounts and a root-less user:<br>• dry-run found both users and all 4 accounts, writing nothing;<br>• `--apply` set every flag to `healthy`;<br>• a second dry-run found 0 variances;<br>• `rebuild-financial-summaries.ts` ran the accounts step only |

Results:
- `npm test`: 386 files, 5,734 tests, all passing.
- `typecheck:shared`: passes.
- Full `tsc`: passes.
- Scripts tsc: passes.
- `verify-performance-budgets`: passes.

## Usage (unchanged CLIs, both dry-run by default)

```
npx tsx scripts/rebuild-domain-summaries.ts   [--uid=<uid>] [--apply] [--override-zeros]
npx tsx scripts/rebuild-financial-summaries.ts [--uid=<uid>] [--accountId=<id>] [--apply]
```

## Left for SPENDLY-500

The production dry-run, review, approval and `--apply` with these scripts, which also apply the 495/496/497 repairs.
