# Phase 4 — Transaction Detection

> **Date:** 2026-08-12  
> **Scope:** Classify SMS as expense / income / transfer / OTP / promotional / non-financial.  
> **Out of scope:** Firebase expense writes, merchant taxonomy templates.

---

## Examples

| SMS | Detection |
|-----|-----------|
| `Your account has been debited ₹500` | **expense** |
| `₹35,000 credited to your account` | **income** |
| `INR 2,000 transferred to A/c … via IMPS` | **transfer** |
| `Your OTP is 482913…` | **otp** |
| `Flat 20% off! Apply now` | **promotional** |
| `Your statement is ready…` | **non_financial** |

---

## Pipeline

```
Raw SMS
   ↓
detectSmsTransaction()   ← Phase 4
   ↓
parseBankSms()           ← kind + amount + date from receivedAtMs
   ↓
pipeline skip / writeReady (local only; no Firestore yet)
```

### Priority order

1. OTP  
2. Promotional (unless clear debit/credit money move)  
3. Transfer  
4. Expense vs Income  
5. Non-financial  

---

## What landed

| File | Role |
|------|------|
| `services/sms/smsDetector.ts` | Classifier + amount extract |
| `services/sms/smsParser.ts` | Uses detector |
| `services/sms/smsPipeline.ts` | Skip reasons per class |
| Types | `SmsDetectionKind`, skip reasons `otp` / `promotional` / `transfer` / `non_financial` |
| Settings | Shows last detection kind |

---

## Commands

```bash
npm test -- services/sms
npx tsc -p tsconfig.json --noEmit
```

Native rebuild only needed if you also want live-receiver checks on device (Phases 1–3). Detection itself is pure JS.

---

## Manual Testing Guide

1. (Optional) Rebuild Android if testing live SMS.  
2. Enable SMS automation.  
3. Receive or scan messages:  
   - Debit → Settings shows `expense`  
   - Credit → `income`  
   - OTP → `otp` (not treated as relevant money move)  
4. Confirm no new Firestore expenses from detection alone.
