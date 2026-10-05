# SPENDLY-388: Stocks portfolio home shows Invested, Current and every holding

**Ticket:** [SPENDLY-388](https://kesavach.atlassian.net/browse/SPENDLY-388) · **Epic:** SPENDLY-119 (Investments & Portfolio Management)
**Branch:** `feature/SPENDLY-388-portfolio-home`, cut from `main`. It goes to `main` by PR; this is a standalone story.

## What changed for the user
- **Summary card:**
  - **Current Value** is the headline, with Today's P&L under it.
  - Then **Invested | Overall P&L**, then **Cash Balance | Holdings**.
  - Invested used to be calculated but never shown.
- **Every holding card:**
  - symbol and exchange, the name, and "N units @ average";
  - then **Invested | Current | P&L** (amount + %), and **Today** (amount + %).
  - When live prices are unavailable, Current says **"last price"** and there's no live dot. The existing retry banner stays.
- **Wide layouts:** when the list itself is at least 720 pt wide (tablets), each holding becomes one table row, *Holding | Qty / Avg | Invested | Current | P&L | Day*, under a column header. Phones and the web shell, which caps content width, keep the compact card.
- **Unchanged:** search, filters, sort, FlashList, tap for details, ⋮ for Buy / Sell / Delete, the empty and loading states, and the movers chips.

## One source of truth: `shared/features/portfolio/utils/portfolioMetrics.ts`
**What was wrong:** the dashboard and the list each built their own `HoldingWithMetrics`, with different rules:
- the quote key: `yahooSymbol` vs `yahooSymbol || symbol`;
- the price fallback: `??` vs `||`, so a ₹0 quote counted as live in one and not the other;
- `dayChange`: per share on the dashboard, per position in the list.

The summary and the cards only agreed by accident.

**Now:**
- **`buildHoldingsWithMetrics(holdings, quotes)`:**
  - uses the existing `computePositionMetrics` unchanged;
  - a live price must be finite and > 0, otherwise it falls back to the average buy price with `hasLiveQuote=false`;
  - `dayChange` is the **position total**, which is what the card and the detail sheet already assumed.
- **`buildPortfolioSummary(holdings, cash)`:**
  - value = Σ current, invested = Σ invested, overall = value − invested, today = Σ dayChange;
  - the same percentage formulas as before;
  - **cash is never part of value or invested**.
- **Data flow:** the dashboard builds both once and passes `holdings` to `HoldingsList`. The list no longer runs its own `useMarketQuotes` or its own calculation.
  - Quotes are cached per symbol (react-query), so this removes duplicate work, not network requests.
  - **No new listeners or requests** are added.
- **Screen-reader labels:** `holdingA11yLabel` and `portfolioSummaryA11yLabel` give full-sentence labels with both invested and current. Every amount is replaced with "hidden" in ghost mode.
  - This also fixes the hero's old label, which read the raw number ("Amount 30285.9").

## Tests: `portfolioMetrics.test.ts` (11)
- **The ticket scenario:** HDFCBANK ×4, KPITTECH ×30, SILVERBEES ×60.
  - Per-holding invested, current and P&L, e.g. KPIT: ₹14,809.80 / ₹14,758.50 / −₹51.30, and day −₹1.50.
  - The header totals equal the sum of the cards. Overall = current − invested = Σ P&L, and today = Σ day.
- **Parity:** results match the previous dashboard formulas (per-share × quantity).
- **Cash:** it stays out of the valuation.
- **Fallback:** no quote, a 0 price or a NaN price give the average price, `hasLiveQuote=false` and a day change of 0.
- **Quote key:** `quoteKeyFor` falls back to `symbol`.
- **Empty portfolio:** gives zeros.
- **A11y labels:** they include invested and current, and contain no amounts when ghosted.

## Verification
- **Tests:** `npm test` passed 5,400 tests, both typechecks are clean, and `npm run test:rules` passed 523.
- **Web on the Firebase emulator:** checked with the demo data, on a phone viewport and a 1600 px desktop window.
  - The header shows Current, Invested, Overall P&L, Cash and Holdings.
  - The cards show Invested, Current, P&L and Today.
  - The totals reconcile: ₹37,000 + ₹35,700 + ₹32,520 = ₹1,05,220.
  - The "last price" fallback appears, because quotes are blocked in test mode.
- **Web caveat:** the signed-in web shell still crashes in dev on `main`. The cause is the shared `components/ui/card/index.web.tsx`, which spreads a React Native style array onto a DOM `<div>` (triggered by the dashboard's Quick Insights card). For these screenshots it was patched temporarily and reverted; it isn't part of this change. It needs its own ticket.

## Device QA checklist (Spendly Test + emulator)
1. Investments → Stocks.
   - **Expected:** the header shows Current, Invested, Overall and Today, and the cards show Invested, Current, P&L and Today.
   - **Expected:** the totals equal the sum of the cards.
2. Search, the filters (Stocks, ETFs…) and the sort options (Value, P&L %, Day %) still work.
3. Tap a card to open its details. Use ⋮ → Buy, Sell and Delete.
4. Ghost mode: every amount is hidden on screen and in TalkBack.
5. Dark mode and light mode.
6. Airplane mode: the retry banner appears, cards say "last price", and there's no live dot.
7. Tablet or landscape (list at least 720 pt wide): the table row with column headers.

**Commands:** `npx vitest run shared/features/portfolio`, `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`.

There are no schema, rules or data changes, so nothing needs deploying. It ships with the next app release.
