# Phase 2 — SMS Reader

> **Date:** 2026-08-10  
> **Scope:** Native Android inbox bridge + local relevance filter.  
> **Out of scope:** Bank template parsing into expenses, Firebase writes of SMS.

---

## Pipeline

```
Android SMS Database (content://sms/inbox)
        ↓
modules/sms-reader (Kotlin ContentResolver)
        ↓
services/sms/nativeInbox.android.ts
        ↓
smsReader.readMessages() → optional relevance filter
        ↓
React Native (local only — never Firebase raw SMS)
```

---

## What landed

### Local Expo module — `modules/sms-reader`

| Piece | Role |
|-------|------|
| `SmsReaderModule.kt` | `readInbox(limit, minDateMs, afterId)` |
| Fields returned | `id`, `address`, `body`, `receivedAtMs`, `read` |
| Platforms | Android only (`expo-module.config.json`) |

### JS services

| File | Role |
|------|------|
| `nativeInbox.android.ts` | Bridge → native module → `RawSmsMessage[]` |
| `nativeInbox.ts` | Stub for iOS/web/tests |
| `smsRelevanceFilter.ts` | Keep bank/UPI-like SMS; drop OTPs/promos |
| `smsReader.native.ts` | Permission gate + read + filter |

### Settings

**Scan inbox locally** under Automation — shows relevant/total counts and sample senders. Explicitly does **not** upload SMS bodies.

---

## Privacy

- Raw SMS (body/sender/ids) remain on-device.
- Scan UI only surfaces counts + sender addresses locally.
- No Firestore / network write of raw SMS in this phase.

---

## Commands

Native module requires a rebuild (can wait until later phases if you prefer):

```bash
npx expo prebuild --platform android
npx expo run:android
```

Verify JS:

```bash
npm test -- services/sms
npx tsc -p tsconfig.json --noEmit
```

---

## Manual Testing Guide

1. Rebuild Android so `modules/sms-reader` is linked.
2. Grant SMS permission (Settings → Automation → Allow SMS Access).
3. Tap **Scan inbox locally**.
4. Expect a toast with relevant vs total counts; sample senders listed on-device.
5. Confirm Network/Firestore shows **no** new SMS content documents.
6. Deny permission → scan disabled / errors gracefully.
7. OTP-only inboxes should show low/zero “relevant” after filter.
