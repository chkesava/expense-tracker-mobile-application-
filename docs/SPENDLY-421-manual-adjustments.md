# SPENDLY-421: Investments — Manual holding adjustment for invested amount and average price

## Objective
Add a controlled **Manual Holding Adjustment / Cost-Basis Correction** feature for existing holdings so users can correct an existing holding's **invested amount, average price, and/or missing historical acquisition data** without deleting and recreating the holding.

This complements:
* **SPENDLY-419** — Portfolio recalibration and historical transaction reconciliation
* **SPENDLY-420** — Separate Stock Profile from Holding and persist every BUY transaction

## Implementation Details
1. **`ADJUSTMENT` Transaction Type**: Extended `TransactionType` to include `ADJUSTMENT`. This maintains deterministic recalculations for SPENDLY-419, avoiding independent fields on the `Holding` document that would easily drift.
2. **Reconciliation Audit**: Created `holdingAdjustments` collection with a strict `HoldingAdjustmentAudit` schema to ensure adjustments are immutable and fully auditable.
3. **Adjustment Service**: Added transactional writes for `executeMissingAcquisitionAdjustment` and `executeCostBasisAdjustment` in `services/portfolio/holdingAdjustments.ts`.
4. **Firestore Rules**: Secured `holdingAdjustments` in `firestore.rules`.
5. **UI Updates**: 
   - Added a `MoreHorizontal` action button to the header in `HoldingDetailModal.tsx` to reveal the adjustment form.
   - Updated the `Order history` list to cleanly render the new `ADJUSTMENT` rows with an "ADJ" badge and their absolute cost base difference.
6. **Adjustment Form**:
   - Implemented `HoldingAdjustmentModal.tsx` containing forms for "Add missing purchase" and "Correct cost basis" with real-time before/after previews.
