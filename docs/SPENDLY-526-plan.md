# SPENDLY-526: Show stock trading charges for BUY and SELL (plan)

Story under epic **SPENDLY-119** (Investments & Portfolio Management). Status: planned 2026-10-15, not started.

## Goal
Show users how much they have paid in trading charges on Investments → Stocks, split into BUY and SELL, with a date filter. Also:
- show the fees on every trade in the order history;
- let Add Holding record charges on a first purchase.

All of this uses the existing `portfolioTransactions.fees` field. There is no new collection, no migration, and no change to historical records.

## What the code does today
| Area | Today | Gap |
|---|---|---|
| Mock BUY (`executeMockBuy`, `services/portfolio/investmentCash.ts`) | Cost = q×p + fees. Fees are folded into the weighted average. Cash PURCHASE = cost. `fees` stored on the BUY row. | None (covered in `mockTrade.test.ts`) |
| Mock SELL (`executeMockSell`) | Proceeds = q×p − fees. Only quantity changes; the remaining shares' cost basis is left alone. Cash SALE = proceeds. `fees` stored. | None |
| Add Holding, first buy (`createHoldingWithCash`, `AddHoldingModal`, `usePortfolio.addHolding`) | No fee field. `purchaseAmount = q×avg`. BUY row has `fees: 0`, and its `price` is the average. | **Needs a fee field** |
| Add Holding, same stock again (SPENDLY-420 path in `usePortfolio.addHolding`) | Calls `executeMockBuy` with `fees: 0` hard-coded. | Pass the entered fee |
| Missing acquisition (`executeMissingAcquisitionAdjustment`, `services/portfolio/holdingAdjustments.ts`) | The service accepts `fees`, but `HoldingAdjustmentModal` never passes one. | Add the field (optional) |
| Reconciliation (`shared/features/portfolio/utils/portfolioReconciliation.ts`) | `transactionDerivedCost` ignores fees. | **False `avg_price_mismatch`** on any BUY with fees. Must fix |
| Reconciliation repair / CSV import / cost-basis adjustment | Write `fees: 0`, or no BUY row at all (CSV). | These sources carry no fee data. Keep them at 0 and document it; never estimate |
| Read side | `usePortfolio` already listens to `portfolioTransactions` under `PortfolioDataProvider` on the Stocks tab. `HoldingsList` already uses it. | Totals need **no new Firestore reads** |
| Order history | A section of `HoldingDetailModal` (filters out pending/cancelled). Rows show type, `qty @ price` and date. | Show trade value, fees and net cash |
| Status | Every `portfolioTransactions` writer sets `orderStatus: "executed"`. Pending/cancelled exist only on `portfolioOrders`. | Filter on `executed` anyway, to stay safe |
| Rules | `portfolioTxWellFormed` already allows non-negative bounded `fees`. Holdings and cash entries have no `hasOnly`. | No rules change |
| Realized P&L | Not computed anywhere. XIRR (`shared/utils/portfolioXirr.ts`) already uses net amounts. | See the drift note below |

## Implementation

### 1. Pure fee aggregation (`shared/features/portfolio/utils/tradeCharges.ts`, new, vitest)
```ts
type TradeChargePeriod = "all" | "this_month" | "custom";
summarizeTradeCharges(transactions, range?: { from?: string; to?: string }):
  { total: number; buy: number; sell: number; buyCount: number; sellCount: number }
tradeChargeRange(period, today, custom?) → { from?, to? }   // yyyy-mm-dd, inclusive
tradeCashEffect(tx) → { gross: number; fees: number; net: number }  // BUY gross+fees, SELL gross−fees
```
- **Which rows count:** only `type` BUY or SELL with `orderStatus === "executed"`.
- **Missing fees:** `fees` is read as `Number(tx.fees) || 0`, so a legacy row without the field counts as 0 and is never estimated.
- **Date filter:** applied to `tx.date`, inclusive on both ends.
- **One source, one count:** only `portfolioTransactions` is read, never `investmentCashTransactions`, and each row is counted once by `id`.
- **Rounding:** `roundMoney`.
- **Isolation:** stays inside the portfolio feature, so it is not confused with the bank/card `feeDashboard` and imports nothing from Ganesh's `ganeshReportRange`.

### 2. Stocks page charges card
- **New component:** `components/portfolio/TradingChargesCard.tsx`, rendered in `PortfolioDashboard`'s `chrome` below `PortfolioSummaryCard`.
- **Data:** `transactions` from `usePortfolio()`, the context that is already listening. No new query (SPENDLY-406).
- **Content:**
  - "Trading charges" total, with BUY and SELL subtotals and their trade counts.
  - Period chips (`components/ui/Chip`, `accessibilityRole="radio"`): **All time · This month · Custom**.
  - Custom range: two date inputs following `DownloadStatementModal`'s pattern, validated so that from ≤ to.
- **Styling:** `<Amount ghostable>` with `useDisplayCurrency()`, and the same metric styling as `PortfolioSummaryCard`.
- **Empty state:** "No trading charges recorded yet". Legacy rows count as ₹0 and are never estimated.
- **Performance:** memoize on `transactions` + range.

### 3. Order history (`components/portfolio/HoldingDetailModal.tsx`)
- **BUY and SELL rows:** keep `qty @ price` and add a compact line using `tradeCashEffect`:
  - BUY: "Value ₹X · Charges ₹Y · Total cost ₹Z"
  - SELL: "Value ₹X · Charges ₹Y · Net proceeds ₹Z"
  - When the charge is 0 it is shown as "₹0", not hidden. This makes clear what was recorded.
- **ADJUSTMENT rows:** unchanged.

### 4. Add Holding fees
- **`addHoldingSchema` (`shared/features/portfolio/schemas`):** add optional `fees` (≥ 0, default 0).
- **`AddHoldingModal`:**
  - Add an optional "Charges / fees" input.
  - `purchaseAmount = mockTradeCost(q, p, fees)`. Move that helper, or a pure twin, into `shared/features/portfolio/utils/investmentCash.ts` and reuse it in both places.
  - The affordability check and "Cash after" use the fee-inclusive cost.
  - With "Already own it" (external), the cost is shown but no cash moves.
- **`usePortfolio.addHolding`:**
  - First buy: pass `fees` and the unit price to `createHoldingWithCash`.
  - Same stock again: pass `fees` instead of `0` to `executeMockBuy`. That function already applies fees to the average and to cash, and respects external funding.
- **`createHoldingWithCash`:**
  - Inputs: new `unitPrice` (or `price`) and `fees`.
  - Holding: `averageBuyPrice = (q×p + fees)/q`, so the weighted cost basis includes fees.
  - BUY row: `price` is the unit price (so `hasMatchingTransaction` still matches) and `fees` is the entered value.
  - Cash: PURCHASE `amount` = q×p + fees and `cashBalance` −(q×p + fees), **only** when funded from Investment Cash. That keeps one deduction, under the existing deterministic `entryId`.
  - `investedDelta`: includes fees.
  - Callers that don't pass fees get exactly today's behaviour (fees 0).

### 5. Missing acquisition (`HoldingAdjustmentModal`)
Add the same optional fee input and pass it to `executeMissingAcquisitionAdjustment`, which already handles it.

### 6. Reconciliation: stop flagging BUY fees as mismatches
In `transactionDerivedCost`, BUY adds q×p **+ fees**. SELL handling is pre-existing and stays as it is; log it as a finding. Add tests so a BUY with fees is not reported as `avg_price_mismatch`.

### 7. Paths that stay at `fees: 0`, made explicit
Reconciliation repair, CSV import, cost-basis adjustment and `scripts/reconcile-portfolio-holdings.js` have no fee data. Each gets a short comment (SPENDLY-526) saying fees are left at 0 on purpose and never estimated, and the doc lists them. No historical record is changed.

## Drift and decisions to note
- **"Realized results use the net amount":** the app has no realized P&L metric. SELL proceeds and XIRR are already net of fees, and SELL leaves the remaining shares' cost basis alone. This story adds no realized-P&L feature. If one is wanted, it needs its own ticket.
- **"Pending/cancelled trades":** every `portfolioTransactions` row is `executed` today. The filter is still applied, and the tests cover it.
- **Found while exploring, left out of scope** (logged as findings in the story doc):
  - `holdingAdjustments.ts` reads settings doc `"main"`, while the rest of the code uses `"config"`, so the affordability check for a missing acquisition funded from Investment Cash can wrongly fail.
  - Missing acquisition never updates the `cashBalance` cache or the investment summary.
  - `executeMockBuy` with external funding never updates the summary's `investedValue`.
  - `transactionDerivedCost` subtracts a SELL at the sale price instead of at cost basis.

## Branching and workflow
1. Fast-forward the epic branch `feature/SPENDLY-119-investments-portfolio-management` to `main`. It is already fully merged and has no commits of its own.
2. Move SPENDLY-526 to In Progress.
3. Cut `feature/SPENDLY-526-trading-charges` from the epic branch.
4. Implement, test, commit `feat(SPENDLY-526): …`, then comment on Jira.
5. **Ask before** merging into the epic branch, and again before merging the epic to `main`.
6. Story doc: `docs/SPENDLY-526-trading-charges.md`. Update the epic tracker `docs/SPENDLY-119-investments-portfolio-management.md`.
7. Hold the Netlify and Android release for this feature, then trigger it together with SPENDLY-525, which is already on `main` and waiting.

## Tests
- `tradeCharges.test.ts`:
  - BUY and SELL totals and subtotals.
  - BONUS/SPLIT/DIVIDEND/ADJUSTMENT excluded; pending/cancelled excluded.
  - A missing `fees` field counts as 0.
  - Date range inclusive at both ends: This month, Custom, All time.
  - No double count when the same id appears twice.
  - Cash-effect math for BUY and SELL.
- `investmentCash.test.ts` (`createHoldingWithCash`):
  - Investment Cash with fees: PURCHASE = q×p + fees, one deduction, BUY row `fees`, unit `price`, average includes fees.
  - External with fees: no cash entry, no `cashBalance` write, average still includes fees.
  - No fees passed: identical to today.
  - Retry with the same ids: same paths, one deduction.
- `mockTrade.test.ts`: the SELL fee keeps the remaining cost basis unchanged; the same-stock-again path with fees.
- `holdingAdjustments.test.ts`: missing acquisition with fees.
- `portfolioReconciliation.test.ts`: a BUY with fees produces no `avg_price_mismatch`.
- `schemas` tests: `fees` optional, ≥ 0, a negative value rejected.
- Rules: unchanged. Optionally add a `fees < 0` denial case to `firestore/holdingAdjustments.rules.test.ts`.

## Verification
- `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`, and `git diff --stat <epic branch>`.
- Spendly Test on the emulator:
  - Add a holding with ₹20 charges, funded from Investment Cash. Cash drops by q×p + 20 exactly once, and the holding average includes the 20.
  - Add a holding marked "Already own it" with charges. Cash is unchanged.
  - Mock BUY with charges, then SELL with charges.
  - Charges card: All time, This month and Custom totals match the trades. Order history shows value, charges and net per row.
- Android check: the card stays responsive with a long trade list, and chips and inputs are announced correctly by TalkBack.

## Critical files
- New: `shared/features/portfolio/utils/tradeCharges.ts` (+ test), `components/portfolio/TradingChargesCard.tsx`
- Changed:
  - `components/portfolio/PortfolioDashboard.tsx`, `components/portfolio/HoldingDetailModal.tsx`
  - `components/portfolio/AddHoldingModal.tsx`, `components/portfolio/HoldingAdjustmentModal.tsx`
  - `hooks/usePortfolio.ts`
  - `services/portfolio/investmentCash.ts`
  - `shared/features/portfolio/schemas/index.ts`, `shared/features/portfolio/utils/investmentCash.ts`
  - `shared/features/portfolio/utils/portfolioReconciliation.ts`
