# SPENDLY-683: Group Funds S1, accounting model, types and pure logic

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md` has the accounting model and data flow).

**Branch:** `feature/SPENDLY-683-group-funds-model`.

## What was built
- **`shared/types/groupFund.ts`:** `GroupFund`, `GroupFundEvent`, the purpose, member and totals types, limits, and persisted enum ids.
- **`shared/types/expense.ts`:** `AccountEntrySource` adds `group_fund_contribution | group_fund_payout | group_fund_move | group_fund_reversal`. `AccountEntry` adds `linkedGroupFundId` and `linkedGroupFundEventId`. Both changes are additive.
- **`shared/utils/groupFundModel.ts`:** validation (amounts reuse `goalModel`), safe map-key ids, enum guards, `emptyGroupFundTotals`.
- **`shared/utils/groupFundMath.ts`:**
  - one per-event effect definition, `groupFundEventEffect`;
  - `rebuildGroupFundTotals` and `reconcileGroupFund`;
  - `totalGroupFundsHeld` (for the net worth input in S4);
  - `memberContributionStatus` (AC9).
- **`shared/utils/groupFundWrites.ts`:**
  - builders: `buildCreateGroupFund`, `buildEditGroupFund`, `buildContribution`, `buildPayout`, `buildOpening`, `buildPurposeTransfer`, `buildAccountMove`, `buildReversal`;
  - `groupFundWritePlanToOps`;
  - the path and id helpers.

## What is deliberately not here
- Nothing in this story writes to Firestore.
- The fund rules, the `CREATE_ONLY_SEGMENTS` entry, the store and the account-screen classification are S2 (SPENDLY-684).

## Tests
`shared/utils/groupFundModel.test.ts`, `groupFundMath.test.ts` and `groupFundWrites.test.ts` cover:
- exactly one account leg per contribution or payout;
- no write outside the fund, its events and account entries;
- over-payout and over-reversal guards;
- transfer pairs and account moves;
- one reversal per event;
- deterministic ops on retry;
- stored totals equal to the rebuilt history across a mixed sequence (split purposes, multiple accounts, partial collection, reversal).
