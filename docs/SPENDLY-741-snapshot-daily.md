# SPENDLY-741 — Daily net-worth and portfolio snapshots on the server

Story in epic **SPENDLY-735**, audit items A5 and A11. Branch `feature/SPENDLY-735-remaining`.

## Before
- **Net worth:** the dashboard's `useNetWorthSnapshotRecorder` wrote `netWorthHistory/{YYYY-MM}` once a day. It needed about 16 listeners plus 60 s price polling while the dashboard was open, and confirmed on Firestore whenever inputs came from the copy (SPENDLY-599).
- **Portfolio:** `PortfolioDashboard` → `saveDailySnapshot` read `portfolioSnapshots/{today}` on every summary change, including each 60 s quote refresh (about 1 read a minute), and created it once a day.

Neither was recorded unless the screen was opened.

## After
**`scripts/snapshot-daily.ts` + `scripts/lib/snapshotDailyCore.ts`** run at 08:30 IST through the Worker, gated by `SNAPSHOT_DAILY_ENABLED`. Per user:
- **Inputs:** read from Firestore, all small collections, no ledger:
  - accounts and account types;
  - investments, holdings, the investment cash ledger and portfolio settings;
  - borrowings and receivables, with their repayments;
  - Group Funds;
  - the EPF summary.
- **Prices:** from this repo's market functions **in-process** (`sipPrice`, as `sip-daily` does), with no Netlify invocation.
- **Net worth:** the app's own `composeNetWorth`, with the same derivations as the hooks:
  - `computeInvestmentCashBalance`;
  - `summarizeBorrowings` / `summarizeReceivables`;
  - `summarizeGroupFundsHeld`;
  - EPF `currentBalance`.

  `snapshotBlockers` decides when the day can't be recorded (untrusted balances, Group Funds unknown, invalid totals). `netWorthSnapshotWrite` builds the merge of today's point. An already-recorded day is never rewritten.
- **Portfolio:** `buildHoldingsWithMetrics` + `buildPortfolioSummary`, **created** once a day when portfolio onboarding is complete.
- **Unpriced holdings:** a holding without a price is valued at cost (SPENDLY-620).
- **Already recorded:** a user with both already recorded today costs 3 reads and no price lookups.

**App:**
- `useNetWorthSnapshotRecorder` became `useNetWorthSnapshotStatus`, which is display only: the card still says whether today is saved and, if not, why. The waiting text is now "Today's net worth is saved each morning."
- Removed: `saveDailySnapshot` and its Portfolio effect.
- Deleted: `services/netWorth/netWorthHistoryStore.ts` and `netWorthSnapshotVerify.ts`.

## Guards
- **providerSwitch:** "the app records no daily snapshots". It replaces the two SPENDLY-598/599 copy-confirmation checks, and is stricter.
- **The server-push allowlist:** `snapshotDailyCore.ts`.
- **The Worker's daily list:** now ends with `snapshot-daily`.

## Tests
`scripts/snapshotDailyCore.test.ts` (6) covers:
- the app's net-worth arithmetic;
- valuing at cost without a price;
- today's point plus the portfolio snapshot;
- already recorded means no work and no price lookups;
- an untrusted balance blocks only the net-worth point;
- no onboarding, a dry run, and duress.

## Found along the way
`scripts/tsconfig.json` inherits the root `exclude: ["scripts/**"]`, so `tsc -p scripts/tsconfig.json` type-checks **no** script.
- This branch's scripts were checked with an include-based config (`tsconfig.scripts-check.json`, local only). Every script is clean except the pre-existing `scripts/smokeWebBackup.test.ts(115)` (SPENDLY-705).
- Worth a ticket: a real `typecheck:scripts` in the PR checks.

## Owner steps (after the epic reaches `main`)
1. Run *Snapshot daily* as a dry run.
2. Set `SNAPSHOT_DAILY_ENABLED=true` and redeploy the Worker.
