# SPENDLY-526: Stock trading charges for BUY and SELL

Story under epic SPENDLY-119. The plan is in [SPENDLY-526-plan.md](SPENDLY-526-plan.md).

## What the user gets
- **Investments → Stocks: a "Trading charges" card** below the portfolio summary.
  - It shows total charges, plus BUY and SELL charges, each with its trade count.
  - Period chips: All time · This month · Custom. Custom takes a From/To date (YYYY-MM-DD), checks that From comes before To, and filters on the trade date, both ends included.
  - Empty states: "No trades in this period" and "No charges were recorded on these trades". Amounts respect ghost mode.
- **Order history** (holding detail): every BUY/SELL row now has a second line.
  - BUY: "Value · Charges · Total cost".
  - SELL: "Value · Charges · Net proceeds".
  - A charge of ₹0 is shown, not hidden.
- **Add Holding**: an optional "Charges / fees" field. "This purchase" shows the cost including charges, and that is also what the affordability check and "Cash after" use.
- **Missing acquisition** (Adjust holding): the same optional charges field.

## Accounting
| | Effect |
|---|---|
| BUY charges | Added to the cost. The stored average is (q×p + charges)/q; the invested value includes them. |
| SELL charges | Subtract from proceeds (unchanged from before). The remaining shares' cost basis is untouched. |
| Investment Cash funding | One PURCHASE entry of q×p + charges, and one `cashBalance` decrement. A retry with the same ids writes the same docs. |
| "Already own it" (external) | Charges still go into the cost basis and onto the BUY row; investment cash is not touched. |
| Total trading charges | Sum of `fees` on executed BUY + SELL `portfolioTransactions` rows, counted once per id. It is never read from `investmentCashTransactions`, whose amounts already include the fee. |
| Legacy rows | A missing or 0 `fees` field counts as 0. Nothing is estimated or rewritten. |

## Changes
- **`shared/features/portfolio/utils/tradeCharges.ts` (new):**
  - `summarizeTradeCharges`, `tradeCashEffect`, `tradeFees`, `acquisitionCost`.
  - `tradeChargeRange`, `isValidTradeChargeRange`, `TRADE_CHARGE_PERIODS`.
- **`services/portfolio/investmentCash.ts`:**
  - `createHoldingWithCash` takes `fees`. The holding average, the BUY row (`price` = unit price, `fees`), the PURCHASE amount, `cashBalance` and `investedValue` all include the charges.
  - `mockTradeCost` now delegates to `acquisitionCost`.
- **`hooks/usePortfolio.ts`:** `addHolding` takes `fees` in its options and passes it on both the first-buy and same-stock-again paths. It stays out of `holding`, because that object is the holding document's shape.
- **Screens:**
  - `components/portfolio/AddHoldingModal.tsx`: the charges field.
  - `components/portfolio/HoldingAdjustmentModal.tsx`: the charges field.
  - `components/portfolio/TradingChargesCard.tsx` (new), rendered by `PortfolioDashboard`.
  - `components/portfolio/HoldingDetailModal.tsx`: the breakdown line on each trade.
- **`shared/features/portfolio/utils/portfolioReconciliation.ts`:** `transactionDerivedCost` now adds BUY charges. Before this, every BUY with charges was flagged as an `avg_price_mismatch`.
- **Paths kept at `fees: 0`**, each with a comment saying why:
  - reconciliation repair (`applyReconciliationRepairs`);
  - `scripts/reconcile-portfolio-holdings.js`.
  The cost-basis ADJUSTMENT row has no charge by nature. CSV import writes no BUY rows and has no fee column.
- **Reads and rules:** no new Firestore reads. The card uses the `portfolioTransactions` listener `PortfolioDataProvider` already runs on the Stocks tab. Rules are unchanged; `portfolioTxWellFormed` already bounds `fees` ≥ 0.

## Drift from the ticket
- **"Realized results use the net amount":** the app computes no realized P&L. SELL proceeds and XIRR are already net of charges. A realized-P&L feature would need its own ticket.
- **Pending/cancelled:** every `portfolioTransactions` writer records `executed`. The filter is applied anyway and is covered by tests.

## Findings, not fixed here
| Rank | Finding | Where | Ticket |
|---|---|---|---|
| P1 | **Missing acquisition always reports insufficient cash.** It reads settings doc `"main"` while the rest of the portfolio code uses `"config"`. The settings come back empty, so the cash check sees ₹0 and every Investment-Cash-funded missing acquisition fails with "Insufficient cash balance". | `services/portfolio/holdingAdjustments.ts` | SPENDLY-527 |
| P2 | **Missing acquisition skips the cached totals.** It never updates the `cashBalance` cache or the investment summary. | same | SPENDLY-528 (blocked by 527) |
| P2 | **External mock buys skip the invested value.** `executeMockBuy` with external funding never updates the summary's `investedValue`. | `services/portfolio/investmentCash.ts` | SPENDLY-529 |
| P3 | **Reconciliation prices a SELL wrongly.** `transactionDerivedCost` subtracts a SELL at its sale price rather than at cost basis. | `portfolioReconciliation.ts` | SPENDLY-530 |

## Tests
- `tradeCharges.test.ts` (11):
  - totals and subtotals; other types and pending/cancelled rows excluded;
  - legacy rows with no `fees`; one count per id;
  - inclusive date ranges; negative or non-numeric fees treated as 0;
  - cash effect; acquisition cost; periods and range validation.
- `investmentCash.test.ts`:
  - Investment Cash + charges: one deduction of value + charges, average includes charges, BUY row has the unit price and `fees`.
  - External + charges: no cash moves.
  - No charges: same as before.
  - A retry with the same ids writes the same docs.
- `mockTrade.test.ts`: a SELL with charges leaves the average untouched and records `fees`.
- `holdingAdjustments.test.ts`: a missing acquisition with charges.
- `portfolioReconciliation.test.ts`:
  - A BUY whose charges are in the average is not flagged.
  - A real mismatch is still flagged, using the charge-inclusive average.
