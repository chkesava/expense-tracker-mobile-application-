# Phase 14 — Recurring Transactions

> **Date:** 2026-08-19  
> **Scope:** Detect repeating merchant + amount patterns, infer monthly vs every-N-days cadence, and queue them for review before they become subscriptions.  
> **Out of scope:** Insights (15), AI parser (16), auto-posting a second expense for detected (SMS) subs.

---

## Example

```
Netflix
₹649
₹649
₹649
₹649
       ↓
🔄 Recurring payment to review
Netflix · ₹649 / month
```

The row is **not** created automatically. It appears under **Ledger → Subscriptions → Needs review**. Review (you can change frequency) adds it; Decline remembers the merchant so it never comes back.

Chicken bought every two days across three months is **every 2 days**, not monthly.

---

## Rules

A pattern is recurring when:

- Same merchant + same amount
- At least **3** distinct dates
- **Monthly** if the median gap is 20–40 days, or the same-ish day-of-month across ≥ 3 months **and** the median gap is ≥ 20 days
- **Every N days** if the median gap is 1–19, gaps are consistent, and there are ≥ 4 occurrences **or** a span of ≥ 14 days

Spanning three calendar months is **not** enough by itself (that was mis-classifying groceries as monthly).

Same amount three times in one week (e.g. Swiggy) is **not** a subscription.

Detected items:

- Sit in the local review inbox until Review or Decline
- After Review they are shown with a **DETECTED** badge
- **Not** auto-posted by the processor (purchases already exist)
- Declining, or deleting any subscription, remembers the **merchant** (local + Firestore `recurringDismissals`) so detection cannot loop

Manual **Add New** still auto-posts. It now has **Every N days** or **Monthly (day of month)**.

---

## Files

- `services/sms/smsRecurringDetector.ts` — cadence classification
- `services/sms/smsRecurringStore.ts` — suggestions inbox + dismissed merchants
- `services/sms/smsRecurringDismissals.ts` — Firestore dismissals
- `services/sms/smsRecurringSync.ts` — queue review, never auto-create
- `hooks/useSmsRecurringSync.ts` — runs on the live expense list
- `hooks/useRecurringSuggestions.ts` — review inbox subscription
- `components/subscriptions/RecurringReviewItem.tsx` — Review / Decline row
- `components/dashboard/SubscriptionsWidget.tsx` — next-due from cadence
- `shared/types/subscription.ts` — `frequency`, `intervalDays`, `lastProcessedDate`

---

## Commands

```bash
npm test -- services/sms shared/utils/subscriptionProcessor.test.ts
```

No native rebuild required. `npx expo start` hot-reload is enough. Firestore dismissals need a signed-in user.

---

## Manual Testing Guide

1. Keep the app running (`npx expo start`). No extra install.
2. Confirm Ledger → **Subscriptions** still opens and existing manual subs still appear.
3. Add (or import via SMS) the **same merchant + amount** in **three different months** — e.g. Netflix ₹649 on the 12th of May, June, and July (use unique SMS refs so dedupe does not skip them).
4. Confirm a notification: **🔄 Recurring payment to review** / `Netflix · ₹649 / month`.
5. Tap it and confirm Ledger opens on the **Subscriptions** tab with a **Needs review** card — Netflix is **not** in the active list yet.
6. Tap **Review**, change nothing (or switch frequency), tap **Add Recurring**. Confirm Netflix is in the list with badge **DETECTED**.
7. Open Dashboard and confirm **Recurring Payments** lists Netflix ₹649.
8. Confirm the ledger does **not** get a second auto-posted Netflix expense for the current month (detected subs do not auto-post).
9. Delete the Netflix row. Confirm it does **not** come back on the next dashboard refresh.
10. Add three Swiggy ₹450 expenses in the **same week**. Confirm **no** review card and no Swiggy subscription.
11. Add chicken (same amount) every 2 days at least four times (or across 2+ weeks). Confirm **Needs review** says **every 2 days**, not month. Tap **Decline**. Confirm it never returns even after more chicken purchases.
12. Manual **Add New**: choose **Every N days**, set 2, save. Confirm the row reads `Every 2 days · next …`. Add a monthly rent on day 5 and confirm `Billed on day 5`.
