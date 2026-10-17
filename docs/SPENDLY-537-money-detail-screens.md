# SPENDLY-537: Phase 2d, Money: detail screens

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-537-money-detail-screens`.

This story covers the account detail (`app/(app)/accounts/[id].tsx` and its cards), transaction detail (`transactions/[id].tsx`) and card-bill detail (`credit-card-bills/[id].tsx`) screens.

It is UI only. No calculation, hook, query or write path changed. The modals the screens open (pay bill, reconcile, transfer, cashback, documents, notes) are forms and belong to Phase 6.

## Changes
- **Account balance hero** (`AccountBalanceCard`): moved onto the deep-hero surface. Fixed greens became theme tokens: card surface, accent wash, glow and hairline; tile meta panel; theme primary/primaryForeground Transfer button; control-surface Adjust button. A hidden balance that is negative now reads "-••••••".
- **Credit-card hero** (`AccountCreditHero`): the same surface, replacing the fixed indigo/gold gradient. The "Record bill payment" CTA uses primary/primaryForeground instead of fixed orange with `#111111` text. Warning badge, track and divider use tokens. The unbilled figure is red only when it isn't zero.
- **Account rows** (`TransactionRow`): money in is success with "+", money out is ink with "-", matching the Activity list. The badges and icon tiles use theme tokens.
- **Header and tabs** (`AccountHeader`, `AccountSectionTabs`): theme accent. A card without its own colour takes the theme accent instead of `#6D5AE6`.
- **Other cards:** `AccountHealthCard`, `AccountNotesCard`, `AccountDocumentsCard`, `ActivityStatisticsCard`, `BalanceTrendCard`, `SpendingInsightsCard`, `MonthlyStatementSummary`, `CreditStatementCard` and `CashbackHistoryCard` now use the theme accent, `destructive` and `outlineVariant` hairlines instead of the `accountScreenTheme` palette. In `CreditStatementCard` the status helper now takes the theme colours.

## Bugs fixed
- **Ghost-mode leaks.** These amounts ignored hidden-amounts mode:
  - every amount on the card-bill detail screen (statement, minimum due, remaining, paid, recorded and payment rows, through its `AmountRow`);
  - all 9 amounts in `CreditCardAnalyticsSection`;
  - both amounts in `CashbackHistoryCard`.
- **Raw ISO dates.** These now show in the user's date format:
  - on the bill detail: statement date, billing period, due date and payment dates;
  - the cashback entry dates;
  - the credit statement card's due date;
  - the analytics cycle periods and the "Categories (…)" focus period;
  - the account's baseline date;
  - the past-cycle range labels.

## Not done
- The Audit and Data sub-tabs of the Money hub have no light pass yet; they already use the theme.
- `accountScreenTheme.ts` still serves portfolio and settings components (Phase 4 and Phase 6), plus `shadeCardAccent` for card artwork.
- The credit hero's "Cycle: 10/16 — 11/14" uses its own month/day format, which is not ISO, and was left as is.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npm test` passed 5,522.
  - No new pure logic was added, so there are no new unit tests. The changes are presentational, and the date and ghost fixes reuse the tested `formatDisplayDate` and `Amount` paths.
- **Web, local test mode** (seeded emulator), Midnight Emerald at 390 dp:
  - **Screens:** `/accounts/acct-bank`, `/accounts/acct-card`, `/transactions/exp-1` and a card-bill detail log 0 console errors, nothing overflows, and there are no raw ISO dates or bare "-123" amounts.
  - **Ghost mode, in-app navigation:** the bank detail shows 0 visible ₹ amounts (14 hidden) and the card detail 0 visible (48 hidden).
  - **Test artefact:** an earlier run that used browser "back" reloaded the page and raced the settings sync.
- Android and iOS have not been built.
