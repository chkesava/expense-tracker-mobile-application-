# SPENDLY-567: Axis card duplicate cashback

[SPENDLY-567](https://kesavach.atlassian.net/browse/SPENDLY-567) was split out of SPENDLY-500. The Axis card stored ₹146 outstanding, but the SPENDLY-499 reference recomputed ₹0.

## Cause

The card had two ₹299 **cashback statement credits**, both entered manually:

| Entry | Date | Added | Note |
|---|---|---|---|
| Original | 3 Sep | 13 Sep | "100% cashback on recharge", linked to the ₹299 mobile-recharge expense |
| Duplicate | 2 Sep | 21 Sep | no note, no linked expense |

Card arithmetic:
- Spend: ₹299 (recharge) + ₹146 (11 Oct) = ₹445.
- With both credits: ₹445 − ₹598 = −₹153, which is shown as ₹0.
- With one credit: ₹445 − ₹299 = **₹146**. This is the stored value, so the stored value was right all along.

The user confirmed the duplicate.

## Fix (production)

The fix was a one-off script, dry-run first, then one transaction with a precondition check:

1. **The duplicate is voided, not deleted.** It now carries `voidedAt` plus a `voidReason` that names the original entry. This is the app's own void convention (`voidCreditBillPayment`).
   - The duplicate's source is the `cashback` pseudo-account, so no bank balance moves.
2. **The paid 21 Sep statement now lists the original cashback.** Its `paymentIds` pointed at the duplicate; they now point at the original. `amountPaid` (₹299) and the status (PAID) are unchanged.
   - An older **cancelled** duplicate statement still references the voided entry. It was left untouched.
3. **One-card rebuild:** `rebuild-domain-summaries.ts --uid=… --accountId=<Axis> --apply`. This was 2 operations:
   - the card: it clears the stale `unbilledSpend` and `availableCredit` and marks the card healthy;
   - the user's EPF summary, rewritten with its unchanged values.

## Result

- **Full read-only dry-run:** 24 users, **26/26 `[OK]`**, 0 variance. 0 dashboard repairs.
- **SPENDLY-503 baseline** (`docs/SPENDLY-503-baseline-summary-production-after-567.md`): **26/26 accounts match, 0 variance.**
