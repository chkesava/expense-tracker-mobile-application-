# Phase 7 — Automatic Categorization

> **Date:** 2026-08-12  
> **Scope:** Rule-based merchant → category (no AI).  
> **Out of scope:** Firebase writes, ML/LLM categorization.

---

## Examples

| Merchant | Brief label | Taxonomy used |
|----------|-------------|----------------|
| Swiggy | Food | **Food & Dining** › Food Delivery |
| Zomato | Food | **Food & Dining** › Food Delivery |
| Uber | Transport | **Transportation** › Cab |
| Amazon | Shopping | **Shopping** › Online Shopping |
| Netflix | Entertainment | **Entertainment** › OTT |
| Airtel | Bills | **Bills** › Phone |

---

## Pipeline

```
normalizeMerchantName()     (Phase 6)
        ↓
categorizeSmsMerchant()     (Phase 7 rules)
        ↓
SmsParsedTransaction.category / subcategory
        ↓
expenseAdapter (same ExpenseForm payload shape)
```

User **Settings → Auto-categorization rules** win over the built-in merchant map when passed in `SmsParseContext.categorizationRules`.

Unknown merchants stay uncategorized (`Other` at write time via adapter defaults).

---

## Files

| File | Role |
|------|------|
| `services/sms/smsCategoryRules.ts` | Merchant catalog → taxonomy |
| `services/sms/smsCategorizer.ts` | Lookup + user-rule override |
| `services/sms/smsParser.ts` | Applies category on expenses |

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required.

---

## Manual Testing Guide

1. Enable SMS automation on a device build (Phases 1–3).
2. Receive a Swiggy / Uber / Amazon debit SMS (or rely on unit tests).
3. Confirm parsed draft category is Food & Dining / Transportation / Shopping.
4. Confirm Firestore expenses are still unchanged (write deferred).
