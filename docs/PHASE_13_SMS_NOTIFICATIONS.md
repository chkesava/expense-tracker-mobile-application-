# Phase 13 — Real-Time Notifications

> **Date:** 2026-08-12  
> **Scope:** Local Android notifications when a live SMS becomes a transaction.  
> **Out of scope:** Recurring detection (14), insights (15), AI parser (16), scan-inbox spam, push/FCM.

---

## Copy

When a draft is queued for review:

```
💰 Transaction detected
₹450 • Swiggy
Food & Dining
```

When auto-add writes the ledger:

```
✅ ₹450 Swiggy expense added
```

Income uses the same pattern (`₹35,000 • Income` / `✅ ₹35,000 Salary income added`).

---

## Flow

```
Live SMS
  → processIncomingSmsMessages
  → dispatchWriteReady
  → notifySmsDispatch
       ├── committed → auto-added notification
       └── queued    → detected notification
```

| Case | Notification |
|------|----------------|
| Review mode, new draft | Detected |
| Auto mode, high confidence | Auto-added |
| Auto mode, low confidence | Detected |
| Manual mode | None |
| Duplicate / not relevant / duress | None |
| Settings inbox scan | None (not live) |

Tap **detected** → Transaction Inbox. Tap **auto-added** → Dashboard.

Android 13+ needs `POST_NOTIFICATIONS`. Enabling SMS Transaction Reader also requests it. Denied permission fails soft — SMS still processes.

---

## Files

- `services/sms/smsNotificationCopy.ts` — pure title/body builders
- `services/sms/smsNotifications.ts` — channel, permission, present (dynamic `expo-notifications`)
- `services/sms/smsTransactionProcessor.ts` — notify after live dispatch
- `services/sms/smsAutoAdd.ts` — returns committed/queued entries
- `app/_layout.tsx` — `setNotificationHandler` (foreground banners)
- `providers/SmsReceiverProvider.tsx` — tap routing + permission when listening
- `hooks/useSmsPermission.ts` — request notify permission when SMS is enabled
- `app.json` / `AndroidManifest.xml` — `POST_NOTIFICATIONS`

---

## Commands

```bash
npm test -- services/sms
```

Native rebuild is required for `POST_NOTIFICATIONS` on Android 13+ if the current APK was built before this permission was added:

```bash
npx expo run:android
```

If the app already includes the `expo-notifications` plugin and you only need JS, `npx expo start` hot-reload is enough **after** a build that already has notification permission.

---

## Manual Testing Guide

1. Rebuild/install the Android app if this is the first time adding notification permission (`npx expo run:android`).
2. Open Vault → Settings → turn **SMS Transaction Reader** ON. Allow SMS, then allow **notifications** if prompted.
3. Set handling to **Review before adding**.
4. Send yourself a bank/UPI debit SMS (e.g. Swiggy ₹450). With the app in the foreground or background, confirm a system notification:
   - Title: **💰 Transaction detected**
   - Body: **₹450 • Swiggy** and **Food & Dining**
5. Tap the notification and confirm it opens **Transaction Inbox**.
6. Switch handling to **Auto-add high confidence**. Send another unique debit SMS. Confirm:
   - **✅ ₹450 Swiggy expense added** (merchant/amount will match the SMS)
   - Ledger/dashboard shows the expense
   - Tap opens **Dashboard**
7. Send the **same** SMS again (or a known duplicate). Confirm **no** new notification.
8. Turn SMS reader **OFF** and send a debit. Confirm **no** notification.
9. Confirm raw SMS is still local — Firestore has only the expense/income doc, never the SMS body.
