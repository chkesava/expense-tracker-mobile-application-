# Credit Card Bill Reminders — Manual Testing Guide

## Commands

```bash
cd C:\dev\expense-credit-card-bills
npm install   # if deps missing in worktree
npm run typecheck
npm test
npx expo start
```

Hot-reload covers most UI changes. Native notification permission / scheduled triggers need a **dev build or Expo Go on a real Android device**.

## Acceptance checklist

1. **Create bill** — Ledger → CC Bills → Add Bill; pick an existing Credit Card account only; save.
2. **Bank rejected** — Attempting create with non-credit account is blocked by validation.
3. **Settings** — Settings → Notifications → Credit Card Bills: toggle off/on, days-before, overdue frequency.
4. **Status** — Create bills with due dates in the past / today / soon / future; status shows OVERDUE / DUE_TODAY / DUE_SOON / UPCOMING.
5. **Pay full** — Open bill → Pay Bill → pay remaining from bank → status PAID; local reminders cancelled.
6. **Pay partial** — Pay less than statement → PARTIALLY_PAID; reminders continue.
7. **Mark as Paid** — Without external payment: bill settled, **no** bank transaction. With external: AccountPayment external only.
8. **Multi-card** — Two cards with open bills; paying one does not stop the other.
9. **History / filters** — CC Bills tab filters + History for PAID.
10. **Cards / account detail** — Open statement summary + Pay Bill deep link.
11. **Notification tap** — Scheduled/local reminder `data.source=credit_card_bill` opens `/credit-card-bills/{id}` (does not mark paid).
12. **Regression** — SMS notifications still work; ExpenseForm unchanged; existing Pay Bill AccountPayment still works.

## Critical reminder stop test

1. Create unpaid bill with reminders on.
2. Confirm schedules reconcile (app foreground).
3. Mark PAID (or pay remaining to 0).
4. Reconcile again — **no** pending `ccbill:{id}:*` notifications; next send skipped.
