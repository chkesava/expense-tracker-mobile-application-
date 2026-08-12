# Phase 12 — Income Detection

> **Date:** 2026-08-12  
> **Scope:** Classify credit SMS into existing income sources.  
> **Out of scope:** A separate income product — sources are the same labels ExpenseForm uses.

---

## Example

```
₹35,000 credited
       ↓
Income
       ↓
Salary
```

| Signal | Source |
|--------|--------|
| salary / payroll / wages, or credit ≥ ₹10,000 with no other hint | **Salary** |
| credited / deposited (smaller, unnamed) | **Bank Credit** |
| received / credited via UPI | **UPI Received** |
| refund / reversal / reimbursement | **Refund** |
| cashback / reward | **Cashback** |
| interest | **Interest** |

These names were added to `INCOME_SOURCES` so the income picker and SMS import stay aligned.

---

## Files

- `services/sms/smsIncomeClassifier.ts`
- `services/sms/smsParser.ts` — sets `incomeSource` on credit drafts
- `services/sms/expenseAdapter.ts` — maps to `createIncome` payload `source`
- `shared/types/expense.ts` — `INCOME_SOURCES`

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required.

---

## Manual Testing Guide

1. Scan or receive `₹35,000 credited to your account`.
2. In Transaction Inbox, confirm **Income** / **Salary**, then **Add**.
3. Confirm Ledger shows an income of ₹35,000 sourced as Salary.
4. Repeat with a refund / cashback / UPI-received / interest credit and confirm the source label.
5. Confirm Firestore `users/{uid}/incomes` has the document — no raw SMS.
