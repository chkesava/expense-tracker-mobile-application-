# Phase 10 — Auto-Add Mode

> **Date:** 2026-08-12  
> **Scope:** Three-way transaction handling. High-confidence drafts can save automatically; low-confidence ones go to Review Inbox.  
> **Constraint:** ExpenseForm create UI is unchanged.

---

## Settings

```
SMS Transaction Reader       ON

Transaction handling:

○ Manual
● Review before adding
○ Automatically add

High-confidence transactions can be automatically added.
Low-confidence ones go to Review Inbox.
```

| Mode | Live SMS | Scan inbox |
|------|----------|------------|
| **Manual** | Detect only — not queued or saved | Parks in Review Inbox |
| **Review before adding** (default) | All drafts → Review Inbox | All drafts → Review Inbox |
| **Automatically add** | High-confidence → Firestore; low → Review Inbox | Same split |

High-confidence means: score ≥ `SMS_AUTO_COMMIT_CONFIDENCE` (0.75) **and** amount, date, and merchant are present. A vague “₹500 debited” without a merchant stays in the inbox.

Failed auto-writes also go to Review Inbox.

---

## Files

- `services/sms/smsAutomationPrefs.ts` — `handlingMode: manual | review | auto`
- `services/sms/smsAutoAdd.ts` — confidence gate + routing
- `components/settings/SmsAutomationSettings.tsx` — radio group
- `services/sms/smsTransactionProcessor.ts` — live SMS dispatch

---

## Commands

```bash
npm test -- services/sms
```

No native rebuild required.

---

## Manual Testing Guide

1. Enable **SMS Transaction Reader** (Android device build, permission granted).
2. Confirm **Review before adding** is selected. Receive or scan a Swiggy debit — it appears in Transaction Inbox, not Ledger.
3. Switch to **Automatically add**. Receive a high-confidence debit (merchant + amount + Ref). Confirm it appears in Ledger without tapping Add.
4. Receive or scan a vague debit without a merchant. Confirm it lands in Review Inbox.
5. Switch to **Manual**. Receive a live bank SMS — it should not appear in the inbox or Ledger. Tap **Scan inbox locally** — candidates appear in the inbox.
6. Confirm Firestore still has no raw SMS.
