# SPENDLY-541: Phase 3d, Merchants & Fees

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-541-merchants-fees`.

This story covers the merchants list and profile (`app/(app)/merchants/*`) and the fees screens (`app/(app)/fees/*`, `components/fees/*`).

It is UI only. Merchant grouping, overrides, insights, fee detection and fee review logic are unchanged.

## Changes
- **Merchants list** (`merchants/index.tsx`), rebuilt on the dashboard foundations:
  - One `Section` of `DataRow`s with an initial-letter `RowGlyph`, instead of a separate `Card` per merchant.
  - Category is shown as the row meta and the transaction count under the amount, so neither truncates at 390 dp.
  - Net spend uses `FinancialAmount`. A merchant that paid you more than you spent shows as "+₹…" in the positive tone, with "net received" in its label.
  - Search uses the shared `SearchBar` instead of a raw `TextInput` on a fixed rgba background.
  - Empty states distinguish "No merchants yet" from "No merchants match".
- **Merchant profile** (`merchants/[id].tsx`):
  - A summary `Section`: category and subcategory, "Net spend · <period>", an `xl` `FinancialAmount`, and a recurring `Pill`.
  - Period `Chip`s (tabs) instead of `Button`s.
  - Transactions are `DataRow`s with a direction glyph and signed amounts (−/+).
  - Spend trend and observed patterns are their own sections.
  - The page header's back button replaces a second arrow under it.
  - Loading uses `DashboardSkeleton`; the not-found state has a short explanation.
  - "unknown recognition" now reads "not yet recognised".
- **Both merchant screens** let `PageShell` scroll and pad instead of nesting a padded `ScrollView`, which had inset the content past the header.
- **Fees.** The screens already used theme tokens, so this story only fixes their ghost-mode leaks and raw dates (below).
- **New helpers:**
  - `shared/utils/ghostMoney.ts`: `ghostMoney(value, currency, ghost)`, with tests. It is the plain-text counterpart of `Amount ghostable` and keeps a negative's sign.
  - `hooks/useGhostMoney.ts`: wraps `ghostMoney` with the current ghost setting. Use it for amounts inside sentences and accessibility labels.

## Bugs fixed
- **Merchants list showed raw numbers.** It displayed `totalSpend.toFixed(2)`, a number with no currency symbol ("18629.00"). It also ignored ghost mode.
- **Ghost-mode leaks.** These now mask in ghost mode:
  - every amount on the merchant profile (total, transactions, trend);
  - the fee overview totals and breakdown, including the "Fee …", "GST …", "reversed" and month-change captions;
  - the fee patterns ("~₹…/yr", "Total so far", the estimated yearly amount);
  - the fee record rows;
  - the Insights "Fees & charges" entry card caption;
  - the review sheet amount, the "Left/Over" remainder and the link options;
  - the fee detail's effect line and linked rows;
  - the accessibility labels on all of these.
- **Raw ISO dates.** These now follow the user's date format:
  - merchant transactions and the spend trend;
  - fee record rows;
  - the fee detail "Date" row and linked rows;
  - the review sheet's record and link options.

## Not done
- **Fee screens with data were not seen on web.** The seeded emulator data has no fee transactions, so only the Fees empty state was checked. The fee changes are mechanical (formatter swaps, `ghostable`, `formatDisplayDate`) and type-checked.
- **The 30/90-day cutoff uses UTC.** `toISOString` sets the boundary in UTC rather than local time. That is calculation, so it is unchanged.
- `FeeReviewSheet` is a form and gets its visual pass in Phase 6. Only its privacy and date bugs were fixed here.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean. `npx vitest run` passed 5,531, including 3 new `ghostMoney` tests.
- **Web, local test mode** (seeded emulator, themes picked in Appearance):
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp:** `/merchants`, a merchant profile and `/fees` log 0 console errors, `scrollWidth` equals viewport width, and there are no raw ISO dates or bare unformatted amounts.
  - **Ghost mode:** 0 visible ₹ amounts on the merchants list (144 hidden) and the profile (200 hidden).
- Android and iOS have not been built.
