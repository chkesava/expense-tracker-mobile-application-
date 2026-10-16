# SPENDLY-535: Phase 2b, Money: Accounts and cards

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-535-money-accounts-cards`, cut from the epic after SPENDLY-534 merged.

This story is UI only: no calculation, write path, rule or query changes, and every component keeps its props.

## Changes
| File | Change |
|---|---|
| `components/accounts/AccountsList.tsx` | **Hero:** reuses the dashboard's `NetWorthHeroCard`, without its "Accounts" link. **Breakdown:** "where it sits" `StatTile`s (bank and cash, FDs, stocks, EPF if any). **Stocks & Demat:** now a `Section`. **Groups:** type headers, then `AccountRow`s with theme tints. **Removed:** the decorative "trend" bars (fixed heights posing as a chart), the per-type hex colour table, and eight unused provider reads (expenses, incomes, entries, payments, transfers, borrowings, receivables, bills). **Net worth:** now `useUnifiedNetWorth({ progressive: true })`, as on the dashboard. The old non-progressive call meant a hero skeleton until market quotes loaded, and the old screen simply showed partial totals; the final figures are the same. |
| `components/accounts/AccountRow.tsx` | The row and its edit pencil are now **sibling** pressables. The pencil used to sit inside the row's pressable, which logged two "`<button>` inside `<button>`" errors on web and made the presses compete on native. The `accentBg`/`accentBorder` props are replaced by one theme `tint`. |
| `components/accounts/CreditSummaryCard.tsx` | Rebuilt as the deep `HeroSection`: unbilled total, a utilisation bar with a word ("Low / Moderate / High utilisation"), and limit / available tiles. The fixed indigo, orange and gold palette is gone. |
| `components/accounts/CreditCardListItem.tsx` | The tappable body (identity, outstanding and available, statement/unbilled split, utilisation, open statement) is one pressable. **Statement** and **Pay bill** are sibling buttons in a footer; they used to be nested pressables. The card's own colour still paints its plastic; everything else uses theme tokens. |
| `components/accounts/CardsList.tsx` | Action buttons and empty-state icons use theme tokens. A card with no colour falls back to the theme accent instead of `#6D5AE6`. |
| `components/creditCardBills/CreditCardBillsList.tsx` | Bills are `DataRow`s in "Current bills" and "History" sections: card, due date and period in the user's date format, statement amount, a status word, and the amount left when partly paid. The filter chips scroll. Loading uses `DashboardSkeleton`. The "Add bill" button no longer puts a bare text node in a View (pre-existing web error). |
| `components/dashboard/FinancialAmount.tsx` | Keeps the sign when amounts are hidden ("-••••••" / "+••••••"). `Amount` drops its prefix in ghost mode, which erased money in versus money out. |
| `components/dashboard/NetWorthWidget.tsx` | Exports `NetWorthHeroCard`, with an optional `showAccountsLink`. |
| `shared/utils/creditCardPresentation.ts` (new, + test) | `creditUtilizationBand` (the same 30 / 70% bands) and `billStatusPresentation`, so a status is a word as well as a colour. |

## Bugs fixed
- **Nested buttons** in the account rows and card rows (web console errors; competing presses on native).
- **Bill amounts ignored ghost mode.** They had no `ghostable` and no currency, and the bills list printed raw ISO due dates.
- **Missing ₹ on liabilities.** The `"-"` prefix replaced the symbol on the Accounts hero; it now goes through the dashboard hero.
- **Breakdown ignored ghost mode.** The four breakdown figures had no `ghostable`.

## Found, not fixed
- **Smart Insights leak (dashboard, from SPENDLY-533):** its message text ("You spent ₹2,068 this week") is a plain string, so it stays visible in ghost mode.
- **`PayCreditBillModal` in `AccountsList` can never open.** Nothing sets its state; this was pre-existing and is left alone.
- **Hardcoded account palette:** `accountScreenTheme.ts` is still used by Borrowings, Receivables (SPENDLY-536), account detail (SPENDLY-537), portfolio and settings (later phases).

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean.
- `npx vitest run shared/utils/creditCardPresentation.test.ts` passed 3 tests; `npm test` passed 5,520.
- **Web, local test mode (seeded emulator), Midnight Emerald at 390 dp:**
  - `?tab=accounts`, `cards` and `ccBills` log 0 console errors, nothing overflows, and there are no bare "-123" or "INR" amounts.
  - **Interactions:** the account pencil opens the edit modal without navigating, a row tap opens `/accounts/acct-bank`, and the card "Pay bill" button opens its statement.
- **Ghost mode, navigating in-app:** Activity, Accounts and Cards show no ₹ amounts, and signs survive ("-••••••", "+••••••").
  - Earlier leaks in the test came from reloading the page right after toggling, before the settings write had synced. That's a test artefact.
- Android and iOS have not been built.
