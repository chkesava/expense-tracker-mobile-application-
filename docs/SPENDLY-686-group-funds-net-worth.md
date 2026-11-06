# SPENDLY-686: Group Funds S4, "Group funds held" in net worth and runway

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md`).

**Branch:** `feature/SPENDLY-686-group-funds-net-worth`, cut from the epic branch.

## The rule
Money held for others sits in real bank and cash accounts. Those balances stay exact: the bank really has it. Personal net worth and runway take it out as its own line, from the funds' **stored** totals (`summarizeGroupFundsHeld`, never re-added from events).

## Net worth (`shared/utils/netWorth.ts`)
- **New input `groupFundHeld`:**
  - **Omitted:** none (every other caller is unchanged).
  - **A number:** the amount held.
  - **`null`:** the funds couldn't be loaded.
- **New totals:**
  - `groupFundLiabilities = max(0, held)`, included in `totalLiabilities`.
  - `groupFundsHeldUnknown` is true when the input was `null`. Net worth then leaves the held money out and says so; it is never silently treated as 0.
- **Identity kept:** `totalNetWorth = totalAssets − totalLiabilities`, and `liquidBankAssets` is unchanged.

## Wiring
- **`hooks/useUnifiedNetWorth.ts`:**
  - Mounts `useGroupFunds()`: one small listener (members and purposes are embedded, no events are read).
  - It loads **with the accounts**, because the held money is inside those balances, so the headline never shows without it.
  - A load error passes `null`.
- **Net-worth history:**
  - `snapshotBlockers` gets a `groupFundsUnknown` blocker, labelled "your group funds couldn't be loaded", so no daily point is recorded with an overstated value.
  - `NET_WORTH_INPUTS` (R4.3a) includes `groupFunds`, so a snapshot built from the on-device copy is confirmed on Firestore first.
- **`shared/utils/financialBaseline.ts`** (the SPENDLY-503 reference): adds `groupFunds` to `BASELINE_COLLECTIONS` and passes the held amount. The snapshot only gains a zero-count `groupFunds` entry for the golden fixture.
- **Dashboard (`dashboardAccountCards`):** a "Held for others" card (owed, caption "Group funds"), shown only when the held amount is above zero. It has no route until SPENDLY-687 adds the screen.

## Runway (`shared/utils/runwaySources.ts`, `hooks/useRunwaySources.ts`)
- **New kind `group_funds_held`:**
  - The rules table defaults it to `obligation`, so the generic classifier never counts it.
  - `buildRunwaySources` adds a single locked line, "Held for others", as a **negative counted** amount (`held_for_others_deducted`). The spendable total drops by the held money.
- **No double deduction:** held money that sits in an account runway doesn't count (unrecognised, other currency, or excluded by the user) is not taken out again. That money was never counted.
- **Opening money with no account** is still taken out.
- **If the funds can't be loaded:** the hook passes `null`, and no line is added.

## Reads
One `groupFunds` collection listener is added to the dashboard's net-worth path and to runway. Both use the same query, which the SDK shares between them.
- A user with no funds pays one read for the empty result.
- No event is ever read here.

## Tests
- **`shared/utils/groupFundNetWorth.test.ts`:**
  - the held summary;
  - unchanged figures without funds;
  - the liability line, with the bank balance unchanged;
  - unknown → flagged and the history point blocked;
  - a negative held amount is never an asset;
  - the runway deduction, the excluded-account rule and opening money.
- **`dashboardAccountCards.test.ts`:** the new card.
- **`runwaySources.test.ts`:** the locked-kinds list now includes `group_funds_held`.
- **`financialBaseline` snapshot:** updated (zero-count `groupFunds`).
- **Full `npm test`:** 7,790 passed. The only failure is the known `lib/readModelLocal/store.test.ts`, which can't load because `fake-indexeddb` is missing.
- **`typecheck:shared`** passes. **`tsc`** shows only the two known missing-package errors.

## Out of scope
Collect-split pots (same gap, user decision 2026-11-05).
