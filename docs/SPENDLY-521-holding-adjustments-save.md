# SPENDLY-521: Holding adjustments never saved

Bug in SPENDLY-421 (manual holding adjustment / cost-basis correction).

## Symptom
Investments → Stocks → a holding → ⋯ → **Correct cost basis** → enter the actual total invested amount. The preview showed the right average, **Confirm Adjustment** said "Holding recalibrated successfully", and the holding kept its old average. **Add missing purchase** behaved the same way.

## Root cause
1. **The batch was never committed.** `services/portfolio/holdingAdjustments.ts` wrapped both writes in `commitWrite(async () => { const batch = writeBatch(db); …; return batch; })`. `commitWrite` expects `run` to *perform* the write. Returning an uncommitted batch resolved straight away, so `commitWrite` reported `"acked"`, the modal toasted success and nothing reached Firestore. TypeScript accepted it because `run` is typed `() => Promise<unknown>`.
2. **A latent rules conflict, hidden by (1).** The cost-basis `ADJUSTMENT` transaction stores the *signed* change in invested amount as `price`, which `portfolioReconciliation.ts` and the order-history row in `HoldingDetailModal.tsx` both rely on. `portfolioTxWellFormed` required `price >= 0`, so lowering a cost basis would have rejected the whole batch with permission-denied.

## Fix
- Both adjustments now `return batch.commit()` and pass a `label` so a late failure is reported.
- The modal uses `writeSavedMessage(outcome, …)`, so an unacked write is not presented as synced.
- `portfolioTxWellFormed` accepts a bounded signed `price` when `type == 'ADJUSTMENT'`; every other type still needs `price >= 0`.

## Tests
- `services/portfolio/holdingAdjustments.test.ts`: both adjustments commit, with the expected holding, transaction and audit writes. It fails against the old code.
- `firestore/holdingAdjustments.rules.test.ts`: signed ADJUSTMENT price allowed and bounded, negative BUY/SELL price denied, the full lowered-basis batch commits, unknown adjustment type and other users denied.
- `npm test` (5375 passed), `npm run test:rules` (546 passed), `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`: all clean.

## After merge
Changes `firestore.rules` and app code. The rule only **loosens** a write, so deploy rules **first**, then ship the app (see `docs/AFTER_MERGE_CHECKLIST.md`):
1. Deploy Firestore rules (GitHub Action, dry run first). Without it, lowering a cost basis on the new build fails with permission-denied; raising one works.
2. Release — Expense (Android), and Deploy Web (Netlify).

Adjustments attempted on older builds were never written, so there is nothing to backfill. Re-apply them on the new build.
