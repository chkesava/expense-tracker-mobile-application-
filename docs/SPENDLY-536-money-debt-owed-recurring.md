# SPENDLY-536: Phase 2c, Money: Debt, owed and recurring

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-536-money-debt-owed-recurring`.

This story is UI only. Calculations, hooks, write paths, FlashList paging and the create/detail modals are unchanged. The forms are Phase 6.

## Changes
| File | Change |
|---|---|
| `components/common/DebtCard.tsx` (new) | One presentational card for a borrowing or money lent. It shows the avatar, an optional headline amount, name and meta, a status `Pill` word, a settled `ProgressIndicator`, `FinancialAmount` figures and the due line. **Record repayment** and the **⋮ menu** are sibling buttons in a footer, not pressables inside the card. |
| `components/borrowings/BorrowingCard.tsx` | Now a mapper onto `DebtCard`; props unchanged. Lender types get semantic theme tints instead of fixed rgba, and the due date uses the user's date format instead of raw ISO. |
| `components/receivables/ReceivableCard.tsx` | Now a mapper onto `DebtCard`; props unchanged, including the SPENDLY-160 received-against-principal-plus-interest bar. |
| `components/borrowings/BorrowingSummaryCard.tsx` | The deep `HeroSection`: Outstanding as the headline, Borrowed / Interest / Repaid tiles, and an overdue `StatusStrip`. Same props. |
| `components/receivables/ReceivablesList.tsx` | The summary is now the same deep hero: total receivable, the accrued-interest line, Overdue / Due this month / Repaid tiles and an overdue strip. |
| `components/borrowings/BorrowingsList.tsx`, `BorrowingFilters.tsx` | The fixed account green becomes theme tokens. |
| `components/subscriptions/SubscriptionsList.tsx` | **Hero:** the deep hero (total, three tiles, due in 7 days, next item). **Badges:** theme tokens; the words are unchanged. **Row:** the info and schedule areas open the edit form, and Pause/Resume is a sibling button. **Dates:** shown in the user's date format. The shared formatter is unchanged; the component passes it an already-formatted date. |
| `shared/utils/debtPresentation.ts` (new, + test) | `debtStatusTone` (status → tone for both kinds) and `settledPercent` (a 0–100 clamp). |

## Bugs fixed
- **Ghost-mode leak in Money lent.** All seven amounts (the four summary figures and the card's three) ignored hidden-amounts mode, and the summary's interest line printed a bare number with no ₹ ("Includes 1234 of accrued interest").
- **Nested pressables.** On the borrowing card the menu and the repayment action sat inside the card's pressable; on the receivable card, the repayment action; on the recurring row, Pause/Resume. On web that's a button inside a button, and on native the presses competed.
- **Raw ISO dates** on borrowing due dates, the recurring "Next:" line and the renewal schedule.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean.
- `npx vitest run shared/utils/debtPresentation.test.ts` passed 2 tests; `npm test` passed 5,522.
- **Web, local test mode** (seeded emulator plus two QA borrowings and one money-lent row, emulator only), Midnight Emerald at 390 dp:
  - `?tab=borrowings`, `receivables` and `subscriptions` log 0 console errors, nothing overflows, and there are no bare "-123" amounts or raw ISO dates.
  - "Record repayment" opens its modal without navigating, the ⋮ menu opens, and Pause is its own button.
  - **Ghost mode** (in-app navigation): Borrowings, Receivables and Subscriptions show 0 visible ₹ amounts.
- Android and iOS have not been built.
