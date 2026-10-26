# SPENDLY-605 — Receivable repayment recorded but totals unchanged

Bug, High. Branch `fix/SPENDLY-605-receivable-repayment-totals`, cut from `main` f16f2be2. Related: SPENDLY-434 (materialised summaries), SPENDLY-496 (balance-moving writes), SPENDLY-42 (snapshot-derived totals).

## Symptom
Receivable "vinay jarugu", ₹1,195, interest-free, with a due date in the past.

- **History:** a ₹1,195 repayment dated 2026-10-22, into State Bank of India.
- **Detail and card:** total received ₹0, outstanding ₹1,195, 0 % received back, overdue.
- **Money Lent summary:** repaid ₹0.

## Root cause
There are two defects, one on each side of the SPENDLY-434 cache.

### 1. The write stamped the cache without the repayment it was writing
- **Handler:** `addReceivableRepayment` in `providers/BorrowingsReceivablesProvider.tsx`.
- **What it did:** it built the parent's new cache with `summarizeReceivable(receivable, [...rows, newRow], today)` and wrote `denormalizedReceivableCacheFields(...)` in the same batch as the repayment row.
- **Why the row was dropped:** `summarizeReceivable` only counts repayments that `repaymentsUpTo` keeps, and `repaymentsUpTo` drops any repayment dated after the as-of date.
- **How the date got ahead of `today`:** whenever the repayment's `date` was later than the provider's `today`, the batch wrote:
  - the repayment row, correctly, which is why history shows it;
  - the parent with `totalReceived: 0`, `outstandingAmount: 1195`, and `status` `ACTIVE`/`OVERDUE`.

  That happens in three ways:
  - The repayment `DateField` had no `maxDate`, so a future date could be picked.
  - `ReceivableDetailModal` defaulted the date with `todayDateKey()`, which uses the device timezone. The provider uses `todayDateKey(settings.timezone)`. Near midnight the form's "today" can be the provider's "tomorrow".
  - The handler captures `today` via `useCallback` dependencies, so a provider that hasn't re-rendered since before midnight still holds yesterday.
- **Same pattern elsewhere:**
  - `deleteReceivableRepayment` and `buildReceivableUpdatePayload` (receivable edits);
  - on the borrowing side, `addBorrowingRepayment`, `deleteBorrowingRepayment` and `buildBorrowingUpdatePayload`.

### 2. The read path trusted the stale cache for good
The SPENDLY-434 fast path returns the stored fields whenever `totalReceived` and `outstandingAmount` exist and the rate is 0. It is used in:
- `receivableSummaries` in the provider, which feeds the card, detail and status filters;
- `summarizeReceivables` in `shared/utils/receivableMath.ts`, which feeds the Money Lent portfolio.

It never compared the stored fields with the repayment rows it already had loaded. So the wrong stamp survived reloads, realtime refreshes and restarts. The borrowing side (`borrowingSummaries`, `summarizeBorrowings`) is identical.

### Not a defect: the account labels
- "Paid from Hdfc bank (locked)" is the receivable's `sourceAccountId`: the account the money was lent **from**. It locks once any repayment exists.
- The history row shows the repayment's `receivedAccountId`: the account the money came back **into**.

These are two different fields on two different docs, so HDFC and SBI can both be correct. `debtLedgerBalanceOps` moves the received account once, in the repayment's batch. It filters only rows dated before the account's balance baseline, never future-dated rows, so the account balance was right even while the parent cache was wrong. The production dry-run below lets you confirm both fields on the stored docs.

## Fix
### Write: stamp every recorded repayment
- New helper `cacheStampDate(today, movements)` in `shared/utils/interestMath.ts`. It returns the latest of today and the movement dates.
- `receivableCacheAsOfDate` and `borrowingCacheAsOfDate` apply it to one parent's repayments.
- All six cache writers listed above now stamp as of that date:
  - add and delete repayment, receivable and borrowing sides (provider);
  - `build*UpdatePayload` (edits).
- Display summaries still use "as of today".
- Interest-bearing parents never take the fast path, so a later as-of date cannot overstate the interest anyone reads.

### Read: don't trust a drifted cache
- New helpers:
  - `receivableRepaymentTotals` / `borrowingRepaymentTotals`: per-parent sums, built once per pass (O(n)).
  - `receivableCacheDrifted` / `borrowingCacheDrifted`: true when the stored total received or paid ≠ the sum of the rows, or, for interest-free parents, when the stored outstanding ≠ principal − principal repaid.
- The fast path in the provider memos and in `summarizeReceivables`/`summarizeBorrowings` now also requires "not drifted". When drifted, they fall back to `summarize*`.
- A parent with **no rows is never judged**. The repayment listeners mount on idle, after the parents, and deliver their whole set at once, so "no rows yet" means "not loaded".
- Existing stale docs, vinay jarugu's included, now display correctly without any data change.
- This also heals the last-writer-wins case, where a second device stamps from a snapshot missing the first device's repayment.

### Input guard
In both `ReceivableDetailModal` and `BorrowingDetailModal`:
- the repayment date defaults to `todayDateKey(settings.timezone)`, the provider's "today";
- `DateField maxDate={today}` is set;
- submitting a future date is refused with "A repayment can't be dated in the future".

### Data repair (dry-run by default)
- `shared/utils/debtCacheRepair.ts` (`planDebtCacheRepair`) plans a restamp for **drifted parents only**. It logs `field: stored → derived` for each field.
- It is wired into `scripts/lib/rebuildRunner.ts` as the `debtCaches` step, enabled in `scripts/rebuild-domain-summaries.ts`.
- A new `--only=<step,...>` flag lets the repair be applied without also applying accounts, EPF or dashboards.
- On `--apply` it writes the cache fields plus `updatedAt`, so the read-model sync picks up the correction.

```
# 1. Dry run (read-only): you run it, with admin credentials
GOOGLE_APPLICATION_CREDENTIALS=<key> npx tsx scripts/rebuild-domain-summaries.ts --uid=<uid> --only=debtCaches
# 2. Only after reviewing the variance report and approving it explicitly
GOOGLE_APPLICATION_CREDENTIALS=<key> npx tsx scripts/rebuild-domain-summaries.ts --uid=<uid> --only=debtCaches --apply
```
- Shared Firebase, no staging. Never `--apply` without an approved dry-run.
- The app already shows correct numbers without the repair. The repair matters for the stored fields and for the Supabase copy of them.

## Invariants kept
- Firestore stays the only write path.
- The repayment row, the parent cache and the balance ops still commit in one `commitMutations` batch. The balance ops are unchanged, so each repayment moves an account exactly once.
- The repayment id is generated on the client, so an outbox retry is the same `set`, not a second row.
- No new ledger and no UI-side money math: everything lives in `shared/utils` and the provider.
- The fast path stays for every parent whose cache agrees with its rows.

## Tests
- **`shared/utils/debtCacheStamp.test.ts` (new, 21 tests):**
  - reproduces the bug: as of today, the future-dated repayment is dropped;
  - full, partial and multiple repayments;
  - a repayment dated after today;
  - another parent's future repayment is ignored;
  - edits restamp;
  - the drift guard: the stale production shape, rows not yet loaded, a consistent cache, a last-writer-wins second device, and a duplicate retry;
  - the borrowing mirror.
- **`scripts/rebuildRunner.test.ts` (+3):**
  - dry-run reports the variance and writes nothing;
  - `--apply` restamps only the drifted parent;
  - `--only=debtCaches` writes nothing else.

**Commands run:**
- `npx vitest run` on the five related files: 142 passed.
- `npm test`: 455 files, 6,354 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- No rules change, so `test:rules` was not run.

## Left over
- **Production confirmation:** you run the dry-run above. It shows vinay jarugu's stored versus derived fields and lets you check `sourceAccountId` against `receivedAccountId`. It was not run here because this session has no admin credentials.
- **Device/UI check:** the repayment date picker refuses future dates on web, Android and iOS. You do the UI review on local Expo web.
- **Lists:** `BorrowingsList` and `ReceivablesList` still compute their own `today` with the device timezone. They only use it for display.
