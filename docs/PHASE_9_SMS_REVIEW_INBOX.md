# Phase 9 — Transaction Review Inbox

> **Date:** 2026-08-12  
> **Scope:** First safe user-facing SMS flow: review detected transactions, then **Add** or **Ignore**.  
> **Constraint:** ExpenseForm create UI is unchanged. Add writes the same Firestore payload shape.

---

## UI

```
Transaction Inbox

3 transactions detected

₹450
Swiggy
Food

[ Add ] [ Ignore ]

₹1,299
Amazon
Shopping

[ Add ] [ Ignore ]
```

- **Add** — creates `users/{uid}/expenses` (or incomes) with the ExpenseForm payload + `createdAt`.
- **Ignore** — removes the row. Duplicate detection still remembers the Ref/UTR so it will not come back.
- Raw SMS is never stored in the inbox and never uploaded.

---

## How items get here

1. Enable SMS automation (Settings).
2. **Scan inbox locally**, or receive a live bank SMS.
3. New, non-duplicate drafts land in the inbox.
4. Dashboard shows a banner when the inbox is not empty.

**Review Before Adding** (default) parks every candidate. **Auto Add** writes immediately on live SMS; failures still go to the inbox. Inbox scan always parks for review (never bulk-writes).

---

## Files

| File | Role |
|------|------|
| `services/sms/smsReviewInbox.ts` | Display helpers + merge/remove |
| `services/sms/smsReviewInboxStore.ts` | Local queue (AsyncStorage) |
| `services/sms/smsReviewActions.ts` | Enqueue / Add / Ignore |
| `services/sms/smsExpenseWriter.ts` | Thin Firestore write (not ExpenseForm) |
| `app/(app)/sms-inbox.tsx` | Screen |
| `components/sms/TransactionInboxItem.tsx` | Card |

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required. Metro hot-reload is enough.

---

## Manual Testing Guide

1. Enable SMS automation and allow SMS permission (Android device build).
2. Open **Settings → Automation** and tap **Scan inbox locally**.
3. Tap **Open Transaction Inbox**. Confirm the header count and cards (amount, merchant, category).
4. Tap **Ignore** on one row — it disappears and does not return on a second scan.
5. Tap **Add** on another row — it appears in Ledger / Dashboard as a normal expense. Confirm the note/tags look like an SMS import.
6. From Dashboard, tap the **Transaction Inbox** banner when items remain.
7. Confirm raw SMS was not uploaded (only the expense document in Firestore).
