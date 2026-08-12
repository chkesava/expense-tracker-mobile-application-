# Phase 11 — Firebase Integration

> **Date:** 2026-08-12  
> **Scope:** Confirmed SMS drafts write through the **same** expense/income create helpers as ExpenseForm.  
> **Constraint:** Do not invent a parallel SMS ledger. Dashboard already listens to Firestore.

---

## Flow

```
SMS
 ↓
Parser
 ↓
Transaction
 ↓
Duplicate check
 ↓
Existing Expense Service  (createExpense / createIncome)
 ↓
Firebase  users/{uid}/expenses | incomes
 ↓
Dashboard
```

**Add** in Transaction Inbox and **Automatically add** both call `createExpense` / `createIncome` — the same functions ExpenseForm uses for new transactions.

Payload shape is unchanged:

- Expense: `{ amount, category, subcategory, date, month, accountId, note, tags, createdAt }`
- Income: `{ amount, source, date, month, accountId, note, createdAt }`

Raw SMS is never uploaded. FinanceDataProvider snapshots keep Dashboard/Ledger in sync.

---

## Files

| File | Role |
|------|------|
| `services/ledger/createLedgerTransaction.ts` | Shared create (ExpenseForm + SMS) |
| `services/sms/smsExpenseWriter.ts` | SMS gate (blocks duress) then shared create |
| `components/ExpenseForm.tsx` | Create path uses shared helpers; edit path unchanged |

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required.

---

## Manual Testing Guide

1. Enable SMS automation, **Review before adding**.
2. Scan or receive a Swiggy debit. Open Transaction Inbox → **Add**.
3. Confirm the expense appears on Dashboard and Ledger (same as a manual add).
4. Confirm Firestore `users/{uid}/expenses` has the document with `tags` including `sms`.
5. Confirm no raw SMS fields were written.
6. Add a manual expense from the + button — it still saves as before.
