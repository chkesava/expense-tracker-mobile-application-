# Phase 14 — Recurring Transactions

> **Date:** 2026-08-12  
> **Scope:** Detect repeating merchant + amount patterns and add them to the existing Subscriptions list.  
> **Out of scope:** Insights (15), AI parser (16), weekly cadence, auto-posting a second expense for SMS-detected subs.

---

## Example

```
Netflix
₹649
₹649
₹649
₹649
       ↓
🔄 Recurring payment detected
Netflix · ₹649 / month
```

The row is created in **Ledger → Subscriptions** (and the dashboard **Recurring Payments** widget).

---

## Rules

A pattern is recurring when:

- Same merchant + same amount
- At least **3** distinct dates
- At least **3** calendar months, **or** a median gap of 20–40 days across 2+ months

Same amount three times in one week (e.g. Swiggy) is **not** a subscription.

SMS-detected subscriptions use `source: "sms"`:

- Shown with a **DETECTED** badge
- **Not** auto-posted by the monthly processor (SMS already writes the expense)
- Deleting one remembers the key so it is not recreated

---

## Files

- `services/sms/smsRecurringDetector.ts` — pure pattern detection
- `services/sms/smsRecurringStore.ts` — local occurrence log + dismissed keys
- `services/sms/smsRecurringSync.ts` — create `users/{uid}/subscriptions`
- `hooks/useSmsRecurringSync.ts` — runs on the live expense list
- `components/dashboard/SubscriptionsWidget.tsx` — lists recurring names
- `shared/types/subscription.ts` — optional `source`

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required. `npx expo start` hot-reload is enough.

---

## Manual Testing Guide

1. Keep the app running (`npx expo start`). No extra install.
2. Confirm Ledger → **Subscriptions** still opens and existing manual subs still appear.
3. Add (or import via SMS) the **same merchant + amount** in **three different months** — e.g. Netflix ₹649 on the 12th of May, June, and July (use unique SMS refs so dedupe does not skip them).
4. Confirm a notification: **🔄 Recurring payment detected** / `Netflix · ₹649 / month`.
5. Tap it and confirm Ledger opens on the **Subscriptions** tab with Netflix, badge **DETECTED**.
6. Open Dashboard and confirm **Recurring Payments** lists Netflix ₹649.
7. Confirm the ledger does **not** get a second auto-posted Netflix expense for the current month (SMS-detected subs do not auto-post).
8. Delete the detected Netflix row. Confirm it does **not** come back on the next dashboard refresh.
9. Add three Swiggy ₹450 expenses in the **same week**. Confirm **no** recurring notification and no Swiggy subscription.
