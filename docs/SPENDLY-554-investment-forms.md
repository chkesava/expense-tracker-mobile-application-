# SPENDLY-554 (Phase 6g): Investment forms

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-554-investment-forms`, cut from the epic at `1d47bd6`, which includes SPENDLY-553.

UI only. **Mock trades, holding adjustments, stock cash, SIP plans and EPF writes are unchanged.** That is proven by the A/B check below.

## Ticket estimate vs. what was there
| Finding | Ticket | Actual |
|---|---|---|
| Hardcoded colours | 43 | 43, all removed |
| Ghost leaks | 24 | 17 `Amount`s without `ghostable`, plus one plain-text shortfall in Add Holding. The rest were a line-count artefact. |
| 6a form pattern | all forms | The 5 EPF forms. See "Not done" for the two forms that keep an in-scroll submit. |

## What changed
- **6a form pattern.** The submits of the EPF profile, establishment, transfer, contribution-edit and reconcile sheets are pinned in a `SheetActions` footer. **The handler, `disabled` condition, `loading` and label are copied verbatim.** `EpfCreditSheet` is a list of actions, not a form, so it was left alone.
- **Semantic tokens.**
  - Create Investment: info, success and primary tiles.
  - Mock Trade: Buy uses `success`, Sell uses `destructive`, and its label uses the matching foreground colour. The error text uses `destructive`.
  - Add Holding: the error text uses `destructive`.
  - Manage Stock Cash, Cash History and Onboarding: their washes now use `withAlpha(primary | warning)`.
  - Holding Adjustment:
    - The preview box uses `surfaces.tile`.
    - **The footer was a white bar in dark themes.** It now uses `card`.
    - The confirm label uses `primaryForeground`.
    - **The unselected "Correct cost basis" and "External / Already owned" options had no text colour, so they were black on dark.** They now use `foreground`.
- **Hand-rolled sheets.** The 10 RN `Modal` sheets get the theme `scrim` instead of a fixed black backdrop, plus `useSpendlyScopeVars()`. Their Gluestack inputs keep the theme on web, as in 550 and 553. The 10 sheets: Add Holding, Holding Adjustment, Manage Stock Cash, Mock Trade, CSV Import, Recalibration, Cash History, Onboarding, SIP Plan form and SIP Notifications.
- **Ghost mode.**
  - The 17 `Amount`s are now `ghostable`.
  - The Add Holding shortfall message uses `useGhostMoney`. It used to show the currency code ("INR").
  - `Amount` (shared, Expense-only) now keeps the minus sign when it masks a negative value, and labels it "Hidden negative amount". This matches `ghostMoney`. Ganesh and Nutrition don't use `Amount`.

## QA
**Setup:** web, on an isolated emulator (`127.0.0.2`, Expo `:8093`), freshly seeded for each side.

**A/B write check.** The same UI flows ran on the epic code (A) and the 554 code (B):
1. A mock trade: buy 2 INFY at 1,500 with 20 fees.
2. A SIP plan: INFY / Infosys Ltd, 5,000 monthly.
3. An EPF profile: QA Member, UAN 100200300400.

| Compared | Result |
|---|---|
| `portfolioTransactions`, `holdings`, `portfolioSnapshots`, `portfolioSettings` | identical |
| `investmentCashTransactions` | identical except `correlationId`, a random UUID per write |
| `sipPlans` (all 13 fields) | identical |
| `epfProfile` | identical |
| Every other user collection (accounts, expenses, incomes, summaries, ...) | identical |

The background collections (`meta`, `creditCardBillReminderLogs`, `stats`) were excluded, as in 552 and 553.

The SIP "unique key" console warning shows on both sides, so it predates this story.

**Visual:**
- Covered at Midnight Emerald 390 and 320, and Light 390:
  - the Stocks tab and holding detail;
  - Adjust Holding, Mock Trade, Add Holding and CSV import;
  - the SIPs tab and the SIP form;
  - EPF.
- No page errors and no NaN.
- **Ghost mode on:** no ₹ amount on any of those screens (23, 35, 40, 39, 25, 23, 6, 6 masked).

**Checks run:**
- `npm test`: 384 files, 5,717 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: both passed.
- No new unit tests: the story has no pure logic.

**Not done:**
- Add Holding and Mock Trade keep their submit inside the scroll view. Both size their sheets around it, so moving it into a footer is a layout change; that's left as a follow-up.
- Native device QA.
