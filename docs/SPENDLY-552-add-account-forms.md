# SPENDLY-552 (Phase 6e): Add transaction and account forms

Story under epic SPENDLY-531. Branch: `feature/SPENDLY-552-add-account-forms`, cut from the epic at `2c7d7a8`, after SPENDLY-549 and 550 were merged.

UI only. **How transactions, transfers, reconciliations and card-bill payments are written is unchanged.** That covers idempotency, the offline queue, ledger and summary updates, and stored balance moves. It is proven by the A/B check below.

## What the ticket estimated vs. what was there
| Finding | Ticket | Actual |
|---|---|---|
| `accountScreenTheme` imports | 5 | 5 files, all removed |
| Hardcoded colours | 42 | 40, all removed (the palette moved to shared data) |
| `Amount`s without `ghostable` | 8 | 2 (`PayCreditBillModal`, `RecordCashbackModal`). The rest were a line-count artefact. |
| Plain `formatAmount` | 1 | 1 (`PayCreditBillModal`'s source-change confirmation), now ghost-aware |
| Raw `YYYY-MM-DD` inputs | yes | none left (SPENDLY-557) |

## What changed
- **6a form pattern.** The primary submit of six money forms is pinned in a `SheetActions` footer: manual adjustment, transfer, pay card bill, cashback, edit account and account document. **Every handler, `disabled` condition and label expression is copied verbatim**; only the button's position moved. In Edit Account, "Reconcile Summaries" and "Delete Account" stay in the body.
- **Currency symbol.** A new `components/common/CurrencyPrefix` shows the display currency's **symbol** on every money field: adjustment, transfer, bill payment, cashback, opening balance and credit limit. Some of these had no currency at all. `ExpenseForm` showed the bare code ("INR") and now shows "₹" via `currencySymbol`. No hardcoded ₹ anywhere.
- **Theme tokens.** The five sheets' `accent`, `accentBorder`, `surface` and `insetBorder` locals now come from the theme (`primary`, `withAlpha(primary)`, `card`, `border`). Footer buttons get a primary wash. The reconcile result panel stays semantic: balanced is `success`, out of balance is `destructive`. Validation and error text uses `destructive`.
- **Hand-rolled sheets** (activity filter, download statement, reconcile): scrim backdrop plus `useSpendlyScopeVars()`, so their Gluestack controls keep the theme on web (as in 550).
- **Account colours are data.** The nine-colour palette moved to `ACCOUNT_COLORS` / `ACCOUNT_COLOR_INK` in `shared/types/expense.ts`, with values unchanged and pinned by `shared/types/accountColors.test.ts`. The selected ring uses `card`.
- **Ghost mode:** two `Amount`s gained `ghostable`. The bill-payment source-change confirmation ("X gets ₹n back") uses `useGhostMoney`.
- **`DateField`**: the label, helper and error text now use the theme font. The Edit Account "Balance as of" helper rendered serif on web, the same root cause as SPENDLY-548. `DateField` is used by Expense only.

## QA
**Setup:** web, on an isolated emulator (`127.0.0.2`, Expo `:8093`), freshly seeded for each side.

**A/B ledger check.** The same flows ran through the UI on the epic code (A) and the 552 code (B):
1. An expense of 250 from HDFC Savings.
2. An income of 1,000 to HDFC Savings.
3. A transfer of 500 from HDFC Savings to Cash Wallet.

Every resulting document was then dumped (ids and timestamps excluded):

| Compared | Result |
|---|---|
| Expense document | identical |
| Income document | identical |
| Transfer document | identical |
| All four account documents, including the stored `currentBalance` (HDFC +250 = −250 + 1,000 − 500, Cash +500) | identical |
| Collection counts (expenses, incomes, transfers, entries) | identical |

**Visual:** Midnight Emerald 390 and 320, Light 390. Checked the adjustment, transfer, activity filter and edit account sheets, plus the expense and income forms. No page errors, and the pinned footers, ₹ prefixes and theme accents were correct. The download-statement, reconcile and pay-bill sheets were not opened in QA (their entry points sit behind menus). They're covered by the token changes and typecheck only.

**Checks run:**
- `npm test`: 384 files passed, including the new palette test.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: both passed.

**Not done:** native device QA.

## Not changed
`ExpenseForm`'s layout and submit bar, and the Add sheet, keep their SPENDLY-173 compact design. Only the currency symbol changed there. Restructuring the main add form is out of scope for a no-behaviour-change story.
