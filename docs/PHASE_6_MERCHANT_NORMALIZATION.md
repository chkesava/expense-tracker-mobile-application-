# Phase 6 — Merchant Normalization

> **Date:** 2026-08-12  
> **Scope:** Collapse SMS merchant variants into one canonical name.  
> **Out of scope:** Firebase writes, category mapping from merchant.

---

## Example

```
SWIGGYIN
SWIGGY LIMITED
SWIGGY
SWIGGY*ORDER
       ↓
     Swiggy
```

Same mapping for Amazon, Uber, Zomato, Flipkart, and other catalog merchants.

---

## Pipeline

```
extractSmsFields().merchant     (raw token)
        ↓
normalizeMerchantName()         (Phase 6)
        ↓
SmsParsedTransaction.merchant   (canonical)
SmsParsedTransaction.merchantRaw (original)
```

---

## Matching rules

1. Fold to lowercase alphanumeric (`SWIGGY*ORDER` → `swiggyorder`).
2. Strip SMS/legal suffixes (`limited`, `ltd`, `in`, `order`, `pay`, …).
3. Exact alias or canonical key.
4. Prefix of a catalog name (length ≥ 4) — `SWIGGYIN` → Swiggy.
5. Unknown tokens keep a title-cased cleanup (`BLUE TOKAI COFFEE`).

---

## Files

| File | Role |
|------|------|
| `services/sms/smsMerchantCatalog.ts` | Canonical names + aliases |
| `services/sms/smsMerchantNormalizer.ts` | Fold / match / title-case |
| `services/sms/smsParser.ts` | Applies normalization |

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required.

---

## Manual Testing Guide

1. Enable SMS automation on a device build (Phases 1–3).
2. Receive (or scan) debit SMS whose merchant is `SWIGGYIN` / `SWIGGY*ORDER`.
3. Confirm parsed merchant / note starts with **Swiggy**, not the raw token.
4. Confirm Firestore expenses are still unchanged (write deferred).
