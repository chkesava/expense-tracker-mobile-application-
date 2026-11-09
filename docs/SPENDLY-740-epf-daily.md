# SPENDLY-740 — EPF on the server: catch-up, FY interest and the summary

Story in epic **SPENDLY-735**, audit items A7–A10. Branch `feature/SPENDLY-735-remaining`.

## Before
Opening the EPF tab ran three background passes in the app:
- **`useEpfCatchUp`:** planned the missing expected months and ran the credit-window and lifecycle repairs (KAN-67, SPENDLY-1/72).
- **`useEpfInterestCatchUp`, plus `EpfBalanceTab`:** recomputed and wrote `epfInterestEntries` from every EPF row, on every ledger change.
- **`useEpfSummarySync`:** wrote `financialSummaries/epf`.

`epf-cron` did the catch-up monthly, through a Netlify function (which costs credits).

## After
**`scripts/epf-daily.ts`** runs at 08:30 IST through the Worker, gated by `EPF_DAILY_ENABLED`:
1. **Catch-up and repairs.** It runs the **existing `epf-cron` handler in-process**, so there's one copy of that logic and no Netlify invocation. It pages through every current employment.
   - Every line the handler prints is masked (`maskUids`), because Actions logs are public.
   - It's skipped in a dry run, or with `EPF_DAILY_CATCHUP=off`.
2. **FY interest and the summary** (`scripts/lib/epfDailyCore.ts`, using the shared functions):
   - Interest years come from `interestSchedule` → `creditableYears`. A year is written only when it differs from what's stored, with `computedAt` stamped.
   - A stale year is **deleted**: `dailyJobCore` gained a `delete` write kind, which the push tombstones.
   - The summary comes from `decideEpfSummarySync`, computed over the rows as they'll be after the interest writes.
   - Everything for one user goes in one atomic batch.
   - Work is found on the read model, then confirmed on Firestore. After a catch-up that wrote anything, every owner is checked, because the copy may lag.

**App:**
- `EpfDashboard` only reads the rows (`useEpfLedger`, renamed from `useEpfInterestCatchUp`) and computes the overview card for display.
- Deleted: `useEpfCatchUp` and `useEpfSummarySync`.
- Removed: `EpfBalanceTab`'s recompute, and the dead `recomputeInterest` / `repairCreditWindows` / `repairLifecycleStates`.

**Freshness:** stored interest and the summary refresh at the next daily run. The Balance tab's on-screen schedule is still computed live for display.

## Guards
- **providerSwitch:** "the EPF screens write no derived EPF data". It replaces the SPENDLY-599 check on the summary sync, and is stricter.
- **The server-push allowlist:** `epfDailyCore.ts`.
- **The Worker's daily list:** `subscription-daily`, `sip-daily`, `epf-daily`, `bill-daily`.

## Tests
- `scripts/epfDailyCore.test.ts` (6):
  - writes each creditable year and the summary;
  - nothing to write when in sync;
  - a stale year is deleted;
  - real timestamps, and a dry run writes nothing;
  - the read-model finder, with no owner scan;
  - uid masking.
- `scripts/dailyJobCore.test.ts`: delete writes.

## Owner steps (after the epic reaches `main`)
1. Run *EPF daily* as a dry run.
2. Set `EPF_DAILY_ENABLED=true` and redeploy the Worker.
3. The monthly `epf-cron` workflow (which calls Netlify) can then be retired, since `epf-daily` covers it.
