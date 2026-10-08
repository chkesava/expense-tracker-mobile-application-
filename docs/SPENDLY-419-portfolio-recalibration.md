# SPENDLY-419: Portfolio recalibration & historical transaction reconciliation

## State

Implemented, pending user review and merge to the epic branch. Production backfill (`scripts/reconcile-portfolio-holdings.js`) not yet run.

## Root cause

`createHoldingWithCash()` in `services/portfolio/investmentCash.ts` wrote the `holdings` doc and, for a cash-funded purchase, an `investmentCashTransactions` PURCHASE entry — but never the matching `portfolioTransactions` BUY row that Order History and XIRR are built from. Only `executeMockBuy`/`executeMockSell` ever wrote that row. So a holding's aggregate quantity could disagree with its visible trade history (the reference case: a 40-share KPIT Technologies holding showing only 30 shares across two BUY rows).

## Fix

- `services/portfolio/investmentCash.ts`
  - `createHoldingWithCash` now always writes a `portfolioTransactions` BUY row in the same batch as the holding (and the cash entry, when cash-funded) — for both `investment_cash` and `external` funding. A holding can no longer exist without a matching Order History row, closing the gap left open by SPENDLY-46/KAN-77.
  - New `applyReconciliationRepairs(uid, plan, runId, options)`: writes the backfilled BUY/SELL rows for a `RepairBatchPlan` plus one append-only `portfolioReconciliationAudits` doc per run, in a single batch. Only ever touches `portfolioTransactions` and the audit log — never the cash ledger or the holding itself.
- `shared/features/portfolio/utils/portfolioReconciliation.ts` (new, pure, Firestore-free): `scanHoldingForFindings`, `buildReconciliationReport`, `planRepairs`, `verifyReconciliation`. Detects nine finding types; only `missing_buy_recoverable_from_cash` (a cash PURCHASE/SALE entry exists with no matching transaction row) is ever `auto_repair`. Every other mismatch — an unrecoverable gap, a holding that looks app-funded but has no cash entry, a duplicate, an orphan, an impossible quantity — is `needs_user_input` or `skip_external`, never auto-repaired. Repair ids are deterministic (`recon_tx_<holdingId>_<cashEntryId>`), so a rerun resolves to the same doc and never duplicates.
- `firestore.rules`: new `portfolioReconciliationAudits/{id}` collection, append-only, modeled on `ledgerEvents` (`allow read, create: if isOwner(uid); allow update, delete: if false;`).
- `hooks/usePortfolioReconciliation.ts` (new): drives Scan → Preview → Repair from the same live data `usePortfolio()` already subscribes to — no extra Firestore reads.
- `components/portfolio/PortfolioRecalibrationModal.tsx` (new): minimal preview/repair UI, opened via a new "Recalibrate Portfolio" link in `components/portfolio/ManageStockCashModal.tsx` (alongside the existing "View cash history" link).
- `scripts/reconcile-portfolio-holdings.js` (new): production backfill for the same unambiguous case only, across all users. Dry-run by default (`--apply` to write, `--user <uid>` to scope). Mirrors the pure matching logic in `portfolioReconciliation.ts` in plain JS (same precedent as `scripts/reconcile-credit-card-bill-payments.js`), since shared TS can't be `require()`d from a CommonJS admin script.

## Non-goals (per ticket)

No lot-based/FIFO cost basis, no Holding/Stock Profile data-model change (that's SPENDLY-420), no portfolio UI redesign, no deleting or editing historical records, no new backend.

## Tests

- `shared/features/portfolio/utils/portfolioReconciliation.test.ts` (new, 13 tests): the KPIT reference case, unrecoverable first buy, clean multi-buy/sell holdings, buy-after-sell, external/onboarding skip, ambiguous legacy holding (always `needs_user_input`), negative quantity, duplicate cash entries, orphaned transaction, idempotency across repeated scans, and deterministic repair ids.
- `services/portfolio/investmentCash.test.ts` (extended): `createHoldingWithCash` now writes a BUY row for both funding sources; `applyReconciliationRepairs` writes the repair + audit doc in one batch, never touches the cash ledger or holding, is idempotent on retry, and tolerates a finding with no proposed fix.
- `firestore/personalData.rules.test.ts` (extended): owner create/read, owner cannot update/delete, stranger denied — for `portfolioReconciliationAudits`.

## Manual Testing Guide

1. On the Firebase emulator (Spendly Test / Local Test Mode — never production), seed a holding whose quantity is ahead of its `portfolioTransactions` rows by an amount that exists as an unclaimed `investmentCashTransactions` PURCHASE entry (the KPIT 40-vs-30 case).
2. Open **Stocks → Manage Cash → Recalibrate Portfolio**. Confirm the scan lists the holding under "Can repair automatically".
3. Tap Repair. Confirm Order History now shows the backfilled BUY row with the cash entry's original quantity/price/date, the holding's quantity/average price are unchanged, the Investment Cash balance is unchanged, and the holding's XIRR is no longer NA.
4. Reopen the recalibration flow. Confirm it now reports "Everything reconciles" for that holding (idempotency).
5. Force-close and reopen the app; confirm the backfilled row persisted.
6. Add a brand-new holding with `fundingSource: external` (or via CSV import). Confirm it gets a BUY row in Order History but no Investment Cash movement.
7. Add a brand-new holding funded from Investment Cash. Confirm both the cash PURCHASE entry and the BUY row land together.

## Commands

```text
npx vitest run shared/features/portfolio/utils/portfolioReconciliation.test.ts
npx vitest run services/portfolio/investmentCash.test.ts
npm test
npm run typecheck:shared
npx tsc -p tsconfig.json --noEmit
npm run test:rules
```

Production backfill (after a dry-run report and explicit go-ahead — shared Firebase project, no staging):

```text
node scripts/reconcile-portfolio-holdings.js            # dry run
node scripts/reconcile-portfolio-holdings.js --apply     # write
```
