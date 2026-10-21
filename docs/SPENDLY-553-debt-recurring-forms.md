# SPENDLY-553 (Phase 6f): Debt, recurring and card-bill forms

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-553-debt-recurring-forms`, cut from the epic at `0babeee`, which includes SPENDLY-552.

UI only. **Borrowing and receivable repayment, subscription and EMI scheduling, and card-bill writes are unchanged.** That is proven by the A/B check below.

## Ticket estimate vs. what was there
| Finding | Ticket | Actual |
|---|---|---|
| `accountScreenTheme` | 1 | 1 (`BorrowingFilterSheet`), removed |
| Hardcoded colours | 17 | 17, all removed |
| `Amount`s without `ghostable` | 10 | 6 (borrowing and receivable detail). The rest were a line-count artefact. |
| Plain `formatAmount` | 2 | 2 (statement-reconcile confirmations), now ghost-aware |
| Raw date inputs | yes | none left (SPENDLY-557) |

## What changed
- **6a form pattern.** The submit of Record Borrowing, Record Money Lent, Add Credit Card Bill and Mark Bill as Paid is pinned in a `SheetActions` footer. **The handler, `disabled` condition, `loading` and label are copied verbatim.** In Mark Bill as Paid, the "record external payment" toggle stays in the body.
- **Currency symbol.** `CurrencyPrefix` (from 552) is on every money field here: borrowed principal, amount lent, statement amount and minimum due.
- **Semantic tokens.** In the borrowing and receivable details:
  - the settled banner and checks use `success` and its wash;
  - the written-off and cancelled banner uses `mutedForeground`;
  - overdue text uses `destructive`.
- **`BorrowingFilterSheet`** now uses the theme accent (it was `ACCOUNT_GREEN`). Its Apply label uses `primaryForeground` instead of a fixed dark green.
- **Hand-rolled sheets.** `EditSubscriptionModal` (an RN `Modal`) gets the scrim and `useSpendlyScopeVars()`. `ReconcileStatementModal` (an RN `formSheet`) gets the scope variables. Their Gluestack inputs and buttons keep the theme on web (dark-on-dark text before, as in 550). The subscription wizard keeps its own Back/Next/Save footer.
- **Ghost mode.** The 6 `Amount`s gained `ghostable`. The two reconcile confirmations ("Add ₹n as cashback…", "Replace the open bill with ₹n?") use `useGhostMoney`.

## QA
**Setup:** web, on an isolated emulator (`127.0.0.2`, Expo `:8093`), freshly seeded for each side.

**A/B write check.** The same UI flows ran on the epic code (A) and the 553 code (B):
1. A borrowing of 20,000 from "QA Lender", from a friend, credited to HDFC Savings.
2. Money lent: 5,000 to "QA Rahul" from HDFC Savings.
3. A card bill of 8,450 with a minimum of 850. Both sides were **rejected by the app's own validation** ("a statement bill already exists for this date"), which is identical behaviour.

| Compared | Result |
|---|---|
| Borrowing document (all 18 fields) | identical |
| Receivable document | identical |
| Stored balances (HDFC +15,000 = +20,000 − 5,000) | identical |
| Background collections `meta` (one `outboxAck_*` per committed mutation) and `creditCardBillReminderLogs` (reminder checks on each app load) | **counts differ**. The B emulator also ran an exploration session before the A/B, so it had more app loads. These are written per session by `commitMutations` and `CreditCardBillsProvider`, not by these forms. |

**Visual:**
- Midnight Emerald 390 and 320, and Light 390: borrowing detail, money-lent detail, borrowing filter, subscription editor, card-bill detail and the create forms. No page errors and no NaN.
- **Ghost mode on:** no ₹ amount on the borrowing, money-lent or card-bill details (12, 11 and 5 masked).

**Checks run:**
- `npm test`: 384 files, 5,717 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: both passed.
- No new unit tests: the story has no pure logic.

**Not done:**
- Repay and settle flows live in the detail sheets, whose handlers weren't touched. Only their colours and ghost mode changed, so they weren't re-run here.
- Native device QA.
