# Phase 8 — Duplicate Detection

> **Date:** 2026-08-12  
> **Scope:** Ignore a new SMS when the transaction already exists.  
> **Out of scope:** Firestore expense writes (still local `writeReady` only).

---

## Flow

```
New transaction
      ↓
Already exists?
   ↙       ↘
 YES       NO
 ↓          ↓
Ignore    Continue
```

**Prefer transaction/reference ID** (UPI Ref / UTR / Txn id) whenever the parser extracted one.

---

## Keys (first match wins)

| Key | When |
|-----|------|
| `ref:{UTR}` | External reference present (**primary**) |
| `sms:{id}` / `fp:…` | Same inbox row / exact fingerprint |
| `txn:{kind}\|amount\|date\|merchant\|last4` | **Only when no reference ID** — same-day merchant spend without a UTR |

Same UTR on two SMS (different timestamps/senders) → second is **skipped** (`duplicate`).

Two Swiggy ₹450 spends on the same day with **different** Ref/UTR values → both **continue** (the `txn:` fallback is not used when a ref exists).

Two copies with **no** Ref/UTR, same amount + date + merchant/last4 → second is **skipped**.

---

## Persistence

Seen keys are stored locally (`AsyncStorage`, max 4000). Raw SMS is never uploaded.

Keys are remembered when a candidate continues (`writeReady`) and when inbox scan / inbound SMS runs the pipeline.

---

## Files

- `services/sms/smsDedupe.ts` — key builders
- `services/sms/smsDedupeStore.ts` — local seen-set
- `services/sms/smsPipeline.ts` — skip before adapt
- `services/sms/smsTransactionProcessor.ts` — load/save keys on inbound SMS
- `components/settings/SmsAutomationSettings.tsx` — scan reports new vs duplicate

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required.

---

## Manual Testing Guide

1. Enable SMS automation on a device build (Phases 1–3).
2. Open **Settings → Automation** and tap **Scan inbox locally**.
3. Note **new** vs **duplicates**. Tap scan again — the second pass should show the same messages as duplicates (0 new).
4. Receive (or wait for) a debit SMS that includes a Ref/UTR, then a second alert with the **same** Ref. Confirm the last event shows `duplicates`.
5. Confirm Firestore expenses are still unchanged (write deferred).
