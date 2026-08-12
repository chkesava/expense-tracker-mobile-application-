# Phase 3 — New SMS Receiver

> **Date:** 2026-08-11  
> **Scope:** Runtime `BroadcastReceiver` for `SMS_RECEIVED` → JS processor.  
> **Out of scope:** Bank template parsing completeness, Firebase expense writes.

---

## Pipeline

```
New SMS arrives
      ↓
Runtime BroadcastReceiver (SmsReaderModule)
      ↓
onSmsReceived event → smsListener
      ↓
filterRelevantSms → processRawSmsMessages (transaction processor)
      ↓
Local inbound status only (no raw SMS / expense upload yet)
```

---

## Why runtime (not manifest static)

| Choice | Effect |
|--------|--------|
| Registered only while **Enabled + permission** | Idle when off — no background wake/polling |
| Unregistered on disable / unmount | Minimal battery |
| No static manifest SMS receiver | Safer for Play policy; works while process is alive |

Foreground resume re-asserts listening if prefs say it should be on.

---

## What landed

### Native (`modules/sms-reader`)

- `startListening()` / `stopListening()` / `isListening()`
- Event: `onSmsReceived` with `{ messages: [{ id, address, body, receivedAtMs, read }] }`
- Multipart PDU bodies concatenated per sender
- Synthetic ids (`rx:…`) until inbox `_id` exists

### JS

| Module | Role |
|--------|------|
| `smsListener.android.ts` | Bridge to native events |
| `smsTransactionProcessor.ts` | Prefs gate → relevance → pipeline |
| `smsInboundStatus.ts` | Local last-event metadata |
| `SmsReceiverProvider` | Starts/stops receiver from prefs |

### UI

Settings → Automation shows **Live detection** + last SMS event sender/time.

---

## Commands

Native rebuild still required (same as Phase 2):

```bash
npx expo prebuild --platform android
npx expo run:android
```

```bash
npm test -- services/sms
npx tsc -p tsconfig.json --noEmit
```

---

## Manual Testing Guide

1. Rebuild & install Android build with `modules/sms-reader`.
2. Settings → Automation → **Allow SMS Access** → turn **Enabled** on.
3. Confirm **Live detection: active (waiting for new SMS)**.
4. Send a test bank-like SMS to the device (or trigger a real UPI debit SMS).
5. Expect **Last SMS event** to update with sender (relevant count may be 0 until Phase 4 parser).
6. Turn **Enabled** off → Live detection becomes **off** (receiver unregistered).
7. Confirm no polling / no Firebase raw SMS writes.
