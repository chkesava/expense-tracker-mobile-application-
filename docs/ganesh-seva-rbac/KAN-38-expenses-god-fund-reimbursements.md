# KAN-38 — Expenses, God Fund, Personal Money & Reimbursements

| Field | Value |
| --- | --- |
| Jira | [KAN-38](https://kesavach.atlassian.net/browse/KAN-38) |
| Feature | 05 — Expenses, God Fund, Personal Money & Reimbursements |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

Gap-close on the existing festival expense ledger. Do not invent a second expense system, a per-expense reimbursement status machine, or new summary formulas.

God Fund expense decreases festival cash now. Personal expense does not. A reimbursement is a later payout that reduces God Fund and member pending. Split legs already follow that independently.

## Live schema

| Ticket name | Actual path |
| --- | --- |
| Expense | `pandals/{pandalId}/festivals/{festivalId}/expenses/{expenseId}` |
| Reimbursement | `pandals/{pandalId}/festivals/{festivalId}/reimbursements/{reimbursementId}` |
| Member pending | `pandals/{pandalId}/festivals/{festivalId}/members/{memberId}.pendingReimbursement` |
| Festival summary | `pandals/{pandalId}/festivals/{festivalId}/summary/totals` |

Funding is three numeric legs on the expense: `godFundAmount`, `personalAmount`, `sponsoredAmount`. There is no stored `fundingSource` enum.

Pending owed is a **member aggregate**. Payout documents are status `paid` or `voided`. No new collections or composite indexes. Expense list filters stay in memory (listener cap 400).

## Canonical operations

| Concern | Implementation |
| --- | --- |
| Create expense | existing `addExpense` / `addAssetPurchase` (`expenses.create`) |
| Correct amounts | existing `updateExpenseAmounts` |
| Attach receipt | existing `attachExpenseReceipt` via the durable upload queue |
| Pay reimbursement | existing `addReimbursement` (`reimbursements.create`) |
| Void | existing `voidFinancialRecord` (void reimbursement uses `expenses.void`) |
| Pending queue | `buildFinancialOverview().pendingReimbursementMembers` |
| Obligation rows | `expenseCountsTowardReimbursement` / `personalExpensesForMember` |

Idempotency: a retried Save uses the same `clientOpId` as the document id. Receipt upload is optional and must not block the ledger write.

## Existing code to start from

- `shared/types/ganesh.ts`
- `shared/utils/ganeshMath.ts`
- `shared/utils/ganeshFinancialOverview.ts`
- `services/ganesh/ganeshWrites.ts`
- `hooks/useGaneshWrites.ts`
- `hooks/useReimbursements.ts`
- `app/(ganesh)/add-expense.tsx`
- `app/(ganesh)/add-reimbursement.tsx`
- `app/(ganesh)/reimbursements.tsx`
- `app/(ganesh)/expense/[id].tsx`
- `components/ganesh/funds/ExpensesList.tsx`

## How to implement

1. Keep member-aggregate pending and distinct paid reimbursement docs.
2. Treasurer queue lists members owed, drills into their personal expenses, and pays via `add-reimbursement`.
3. Treasurer/admin can void a payout from the queue. Permission stays `expenses.void`.
4. Slim add-expense: name, amount, funding, paid-from, category, save. Date / vendor / receipt stay behind details.
5. After save, stay on screen with **Add another**. New `clientOpId` for the next row.
6. Expense detail shows category, reimbursement hint, and receipt attach.
7. Expense list: search plus category / paid-by / pending-personal chips.

## Implementation status

- [x] Inspected existing code
- [x] Reimbursement queue + void payouts
- [x] Slim add-expense + Add another
- [x] Expense detail category / hint / receipt
- [x] List search and filters
- [x] Tests added
- [ ] Manual verification
- [ ] Jira KAN-38 updated after merge

## After merge

No Firestore rules deploy is needed unless a later change adds a payload or enum. Summary rebuild stays on Netlify `ganesh-summary` (KAN-36).

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks the client up.

1. Combined build: Expense Tracker still lists personal expenses after sign-in. Nutrition is unchanged.
2. Ganesh Seva: add a God Fund expense. Funds God Fund / Home Available decrease by that amount. Paid-from Cash/UPI/Bank matches the chip.
3. Add a personal-only expense with reimbursement required. God Fund unchanged. Pending reimbursement increases for that member.
4. Funds / Admin / Home pending row opens the reimbursement queue, not the pay form. Tap the member to see their personal expenses. **Pay** opens the existing reimburse form.
5. Save a partial reimbursement. Pending drops by that amount. God Fund drops. Original expense is unchanged.
6. Treasurer voids that payout. Pending and God Fund return. The payout stays in history as Voided.
7. Add expense: first screen is name, amount (quick chips), funding, category. Date is behind **Add details**. After save, **Add another** stays on the screen and records a second row with a new `clientOpId`.
8. Expense detail shows category and “Counts toward pending reimbursement for …”. Attach a receipt after save. Failure toast does not create a second expense.
9. Expense list: search by vendor; chips for Pending personal, category, and paid-by.
10. Double-tap Save on an expense: one row. Viewer cannot pay or void. Closed festival can still read the queue.

## Leftovers

- Per-expense reimbursement lifecycle (`pending` → `partial` → `paid`)
- Budget vs actual by category
- [KAN-42](https://kesavach.atlassian.net/browse/KAN-42) settlement / Permanent Fund polish
- [KAN-39](https://kesavach.atlassian.net/browse/KAN-39) contributions / sponsors — see [KAN-39-contributions-in-kind-sponsors.md](./KAN-39-contributions-in-kind-sponsors.md)
- [KAN-40](https://kesavach.atlassian.net/browse/KAN-40) assets / document vault
- Full expense metadata edit (category / funding-source change as a new audited event)
- Dedicated `reimbursements.void` permission
- Server-side God Fund solvency in rules
- Personal-contribution → contribution-record conversion
