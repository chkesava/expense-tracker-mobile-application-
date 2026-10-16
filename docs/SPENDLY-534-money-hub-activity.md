# SPENDLY-534: Phase 2a, Money hub and Activity

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md), Phase 2 (Money). Branch: `feature/SPENDLY-534-money-hub-activity`, cut from the epic after it was fast-forwarded to `main` (`b9f3f12`).

This story is UI only: no hook, query, listener, calculation or prop changes. It builds on the Phase 1 foundations: `Section`, `FinancialAmount`, `ProgressIndicator`, `DashboardSkeleton` and `signedCurrencyPrefix`.

## What changed
| Area | File | Change |
|---|---|---|
| Hub header | `app/(app)/ledger.tsx` | The Wallet icon takes the theme accent instead of a fixed success green. `PageHeader` itself is untouched, because Nutrition shares it. |
| Section tabs | `components/ledger/LedgerSectionTabs.tsx` | The active section uses the theme accent (emerald in Midnight Emerald, indigo in Light) instead of the fixed "account green". Chips and the More button go from 36 to 40 dp. The nav stays a fixed-height sibling of the list, as the existing comment requires. |
| Filter header | `components/accounts/TransactionFilters.tsx` (also used by account detail) | The accent comes from the theme, and the filter-count badge text uses `primaryForeground` instead of a hardcoded `#FFFFFF`. |
| Loading | `ledger.tsx`, history and income branches | `DashboardSkeleton variant="section"` replaces the five ad-hoc `Skeleton` bars. |
| Period summary | `components/ledger/JournalPeriodSummary.tsx` | Rebuilt as a `Section`. **Granularity:** chips on their own scrollable row (fits at 320 dp). **Totals:** Spent and Income with glyphs and ink (no red or green for plain totals); Net signed with "+"/"-". **Cash notes:** "On cards" and "Net cash movement" in a tinted box. **Periods:** each row has a `ProgressIndicator` bar scaled to its net, labelled "In" or "Out", with its transaction count. **Unchanged:** the props and the staged-ledger rule. The "paused" state is now a `Section` with the full explanation. |
| Activity rows | `components/ExpenseList.tsx` | Expenses get a neutral tile with the category emoji; incomes get a green wash with an arrow instead of 💰. Amounts and the per-row running cash figure go through `FinancialAmount`. **Unchanged:** FlashList, `getItemType`, sticky headers, `SwipeableRow` edit/delete, multi-select and "Load older (+50)". |
| Day headers | `components/ExpenseList.tsx` | The day's net goes through `FinancialAmount`: signed, with ₹, hidden in ghost mode. |
| Detail sheet | `components/ExpenseList.tsx` | Only the large amount's prefix is fixed. The sheet's design is story 2d. |

## Bugs fixed
- **Missing ₹ on activity rows.** The `prefix={"-"/"+"}` on each row replaced the symbol, so rows read "-112". The detail sheet's large amount had the same bug. Both now read "-₹112".
- **Hidden amounts were showing.** The per-row running cash figure and the day subtotal were plain `toLocaleString()` text, so they stayed visible with amounts hidden. The day subtotal also printed the currency code ("INR841").

## Found, not fixed (belongs to 2b)
- **Nested buttons in the Accounts section.** It logs two React errors on web, "`<button>` cannot be a descendant of `<button>`", from `AccountRow` in `components/accounts/AccountsList.tsx`. That's a Pressable inside a Pressable; pre-existing and not touched here. Tracked for SPENDLY-535.
- **Hardcoded account palette.** About 45 Money, portfolio and settings files use the fixed palette in `components/accounts/accountScreenTheme.ts` (`ACCOUNT_GREEN` and friends) instead of theme tokens. 2a only moved the hub tabs and the filter header off it. Moving the rest is for 2b and 2c, where most of those files live.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npm test` passed 5,517 tests.
- **Web, in local test mode** (seeded emulator), at `/ledger?tab=expenses`:
  - Checked Midnight Emerald at 390 and 320 dp, and Light at 390 dp.
  - **Activity:** 0 console errors through load, row tap, the detail sheet, reload and the Income sub-tab. `scrollWidth` equals the viewport.
  - **Amounts:** rows read "-₹…", the sheet "-₹112", with no bare "-123" and no "INR" text.
  - **Navigation:** sticky day headers work; switching sections updates `?tab=`; the All-sections sheet opens.
- Android and iOS have not been built.
