# Phase 5 — Transaction Parser

> **Date:** 2026-08-12  
> **Scope:** Extract amount, merchant, bank, payment method, date, account last4, reference ID.  
> **Out of scope:** Firebase writes (still local `writeReady` only).

---

## Example

```
SMS: Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI
 ↓
Amount:          ₹450
Merchant:        Swiggy
Bank:            SBI
Payment method:  UPI
Type:            Expense
Account last 4:  4521
Reference:       987654321012
Date:            2026-08-12
```

---

## Pipeline

```
Raw SMS
  ↓
detectSmsTransaction()     (Phase 4)
  ↓
extractSmsFields()         (Phase 5)
  ↓
parseBankSms() → SmsParsedTransaction
  ↓
expenseAdapter → local writeReady (no Firestore yet)
```

---

## Extracted fields

| Field | Sources |
|-------|---------|
| Amount | `₹` / `Rs` / `INR` patterns |
| Merchant | `towards` / `to` / `at` / `paid to` / VPA `name@upi` |
| Bank | Sender (`VK-SBIINB`) + body keywords |
| Payment method | UPI, IMPS, NEFT, RTGS, CARD, ATM, NETBANKING |
| Date | Body `DD-MM-YYYY` / `DD-Mon-YYYY`, else SMS timestamp |
| Account last 4 | `A/c XX1234`, `ending 1234` |
| Reference ID | `Ref` / `UTR` / `Txn id` |

---

## Files

- `services/sms/smsFieldExtractor.ts`
- `services/sms/smsParser.ts` (wired)
- `services/sms/expenseAdapter.ts` (note + tags from fields)
- Types: `bank`, `paymentMethod`, `accountLast4`, `time`, `parseReasons`

---

## Commands

```bash
npm test -- services/sms
npx tsc -p tsconfig.json --noEmit
```

No native rebuild required for this phase.

---

## Manual Testing Guide

1. Enable SMS automation (device build from earlier phases).
2. Receive a Swiggy/UPI debit SMS (or use unit tests above).
3. Confirm Settings / logs show structured note like `Swiggy · UPI · SBI`.
4. Confirm Firestore still has no auto-created expense (write deferred).
