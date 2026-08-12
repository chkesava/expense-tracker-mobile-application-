# Phase 16 — AI Parser / Assistant

> **Date:** 2026-08-12  
> **Scope:** On-device fallback when the rule parser is not confident, plus advisor answers for spend questions.  
> **Constraint:** Raw SMS never leaves the device. No cloud LLM.

---

## Parser

```
SMS
 ↓
Rule Parser
 ↓
Confidence?
 ├── High → Transaction
 └── Low
       ↓
      On-device AI fallback
       ↓
Transaction
```

Fallback runs only when there is an amount and the rule parse is **not** auto-add ready (missing merchant, low score, or unclear debit/credit). It:

- Scans the body for known catalog merchants (e.g. Netflix in “Rs 649 deducted. Netflix subscription auto-pay.”)
- Tries extra merchant phrasing (`deducted for`, `auto-pay`, `M/s`)
- May reclassify `non_financial` → expense when a merchant or auto-pay hint is found
- Never overwrites amount/merchant/date the rule parser already set
- Never runs on OTP / promo / transfer

High-confidence Swiggy-style SMS is unchanged.

---

## Assistant

Insights → Advisor answers from **ledger totals** (not SMS):

| Question | Answer uses |
|----------|-------------|
| How much did I spend on food this month? | Food & Dining total |
| Where am I spending the most? | Top category |
| Can I spend ₹3,000 this weekend? | Monthly budget remaining (or net savings) |

---

## Files

- `services/sms/smsAiFallback.ts`
- `services/sms/smsParser.ts` — calls fallback when needed
- `shared/utils/advisorQueries.ts`
- `services/aiAdvisorService.ts`
- `components/ai/AiAdvisorView.tsx`

---

## Commands

```bash
npm test -- services/sms shared/utils/advisorQueries.test.ts
```

No native rebuild required.

---

## Manual Testing Guide

1. Keep the app running (`npx expo start`). No extra install.
2. **High confidence:** send/scan a normal Swiggy debit. Confirm it still auto-adds or lands in inbox as Swiggy — not tagged as AI.
3. **Fallback:** scan `Rs 649 deducted. Netflix subscription auto-pay.` Confirm it becomes a Netflix / Entertainment expense (Transaction Inbox or auto-add).
4. **Still unclear:** `Your account has been debited ₹500` should stay in **review** (no invented merchant).
5. Open **Insights → Advisor**. Ask:
   - How much did I spend on food this month?
   - Where am I spending the most?
   - Can I spend ₹3,000 this weekend?
6. Confirm answers match the dashboard/ledger totals. Confirm Firestore still has no raw SMS body.
