# SPENDLY-719 — Cashback-settled bill stays "Partly paid" and sends an overdue reminder

Bug, standalone (no epic). Branch `fix/SPENDLY-719-cashback-bill-settled-status` from `main`.

## The report
- **Bill:** Roar card statement of 1 Nov 2026 (period 2 Oct → 1 Nov, due 6 Nov). Billed ₹505; cashback ₹236.29 inside the cycle; ₹268.71 paid from HDFC on 2 Nov.
- **Bill detail and Past billing cycles:** PAID, ₹0 left.
- **Card bills → Current bills:** Partly paid, ₹236.29 left.
- **Push:** "Credit card bill overdue" for this bill.

## Calculation rule (unchanged, now written down)
The card ledger (`shared/utils/creditCardLedger.ts`, `buildCreditCardLedger` / `collectCreditBillAllocationPatches`) is the only place that settles statements:

```
statement (billed)  =  cash paid  +  cashback credit  +  remaining
```

- Cashback is an `accountPayment` with `sourceType: "cashback"`. It settles the statement whose billing period contains its date, oldest statement first. It is counted **once**: never also deducted from the billed amount.
- A bill's stored `amountPaid` is the ledger's allocation (cash plus cashback), and its stored `paymentIds` include the cashback row.
- `status` and `remainingAmount` derive from the stored `amountPaid` vs `statementAmount` (`computeCreditCardBillStatus`, `computeRemainingAmount`).

For the report: 268.71 + 236.29 + 0 = 505 → PAID. Pinned in `shared/utils/creditCardLedger.test.ts` ("SPENDLY-719").

## Where each screen reads from
| Where | Source | Counts cashback? |
|---|---|---|
| Bill detail (`app/(app)/credit-card-bills/[id].tsx`) | `creditCardBillView`: the ledger, live | yes |
| Past billing cycles | ledger statements | yes |
| Current bills (`components/creditCardBills/CreditCardBillsList.tsx`) | **stored** bill fields | only once the bill pass has written them |
| Server reminder (`shared/utils/push/sources/billSource.ts`, re-read at send time) | **stored** bill, status recomputed from stored `amountPaid` | same |
| Local reminders (`reconcileBillReminders`) | stored bill | same |

So the stored bill fields are what the list and every reminder trust. Only the bill pass keeps them in line with the ledger.

## Root cause
1. **The payment stamp counts cash only.**
   - Recording a bill payment (`services/creditCardBills/billPayment.ts`, `applyPaymentToBill`) writes `amountPaid: increment(cash)` and stamps the status from that.
   - Cashback was never part of the stored `amountPaid`, so after the ₹268.71 payment the stored bill reads 268.71 of 505: PARTIALLY_PAID, ₹236.29 left.
   - This is by design: the bill pass is meant to correct it from the ledger.
2. **The bill pass then never corrects it** (`providers/CreditCardBillsProvider.tsx`).
   - The pass runs only on first load and on app focus (SPENDLY-45), so nothing requested it after the payment.
   - When it did run around the payment, its compare-and-set could correctly skip ("a stamp landed since I read the bill; let the next pass recompute").
   - The pass recorded its fingerprint anyway. That fingerprint covered what it *would* write (505) but not what was *stored*, so every later pass on app focus matched the fingerprint and returned early.
   - A pass asked for while one was running was dropped (`autoGenerateInFlight`).
   - The stored bill stayed stale until the app process restarted. Android keeps apps in memory for days, so in the meantime the list showed Partly paid and the 09:00 server run sent "overdue" from the stored open status.

### Confirmed on production (2026-11-08, read-only `scripts/reconcile-credit-card.ts`, Roar card `8Pi1R09hJ0SdFJ53wGHu`)
| Close | Bill | Billed | Ledger paid | Ledger remaining | **Stored paid** | **Stored remaining** | **Stored status** |
|---|---|---|---|---|---|---|---|
| 2026-11-01 | `xBIyNqNB0BxLR5DTwA5B` | ₹505.00 | ₹505.00 | ₹0.00 | **₹268.71** | **₹236.29** | **PARTIALLY_PAID** |
| 2026-10-01 | `…_2026-10-01` | ₹929.00 | ₹929.00 | ₹0.00 | ₹929.00 | ₹0.00 | PAID |
| 2026-08-01 | `…_2026-08-01` | ₹4,536.00 | ₹4,536.00 | ₹0.00 | ₹4,536.00 | ₹0.00 | PAID |

- **Cashback counted once.** The single cashback (₹392.29, 2026-10-08, `cashback_83c8474b773d0d3d`) splits oldest-first: ₹156.00 settles August (₹4,380 cash + ₹156) and ₹236.29 settles November (₹268.71 cash + ₹236.29).
- **The card totals are consistent:** stored total outstanding ₹0, ledger ₹0, and "a rebuild would not change it".
- **Only the November bill's stored fields are stale.** Its stored `paymentIds` lack the cashback.
- **What the pass would write now:** `xBIyNqNB0BxLR5DTwA5B` → `amountPaid` ₹505.00, `paymentIds` [`cashback_83c8474b773d0d3d`, `b8f4ac31-…`]. That is the repair the fixed app performs on first open; August is untouched.

## Fix
| Change | Files |
|---|---|
| The pass's fingerprint includes each bill's stored `amountPaid`, `paymentIds`, `status` and `remainingAmount` (`billPassFingerprint`, pure and tested), so a bill whose stored settlement disagrees with the ledger is never mistaken for done. | `lib/readModelLocal/billPass.ts`, `providers/CreditCardBillsProvider.tsx` |
| A pass with a skipped or failed write is **not** recorded as done. It retries up to 3 times, 1.5 s apart, then waits for the next trigger. That is bounded, so offline it never loops. | `providers/CreditCardBillsProvider.tsx` |
| A pass requested while one is running is queued, not dropped. | `providers/CreditCardBillsProvider.tsx` |
| After money actions the pass is requested at once (`requestBillPass`): record, apply, edit or mark a bill payment, and record cashback (Record cashback, Reconcile statement). The stored bill then matches the ledger, cashback included, within about half a second. | `providers/CreditCardBillsProvider.tsx`, `hooks/useCreditCardBills.ts`, `components/accounts/RecordCashbackModal.tsx`, `components/creditCardBills/ReconcileStatementModal.tsx` |

**Not changed, on purpose:**
- **No second calculation.** The list and the reminders keep reading the stored bill. The pass that writes it uses the same ledger as the detail screen, with its compare-and-set (SPENDLY-497) and its R4.3a rule: it never writes from the on-device copy.
- **The server reminder** already re-reads the bill at send time and stops for PAID or zero remaining (`shouldSendBillReminder`). With the stored bill correct, a settled bill can't notify. Recomputing the ledger on the server would mean reading every card expense per send (Spark budget), and it would be a second settlement path.
- **No data repair in code.** Opening the fixed app once runs the pass, which writes the Roar bill's stored `amountPaid` 505 / PAID through the normal path. No backfill script.

## Read model
Every write is the existing bill-pass write (`runTransaction` + `noteTransactionWrites`). There are no new fields or collections, so there is no migration, mapping or allowlist change. `lib/readModelWriteHooks.test.ts` still passes.

## Tests
- `shared/utils/creditCardLedger.test.ts` (SPENDLY-719): the reported shape allocates 505 (cash + cashback, both ids) and leaves 0 remaining; cashback is counted once.
- `lib/readModelLocal/billPass.test.ts` (SPENDLY-719): a bill stamped with cash only is work for the pass; the fingerprint changes when the stored settlement changes and is stable regardless of order.

## Owner actions
1. **Confirm the root cause on the real bill (read-only, production reads):**
   `GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> npx tsx scripts/reconcile-credit-card.ts --uid=<uid> --accountId=<Roar card id> --out=roar.md`
   Expected: the stored bill shows `amountPaid` 268.71, PARTIALLY_PAID, while the ledger allocation is 505.
2. **Repair:** install the build with this fix and open the app once, online. The bill pass writes the Roar bill to PAID. Re-run step 1 to confirm. No script and no manual edit is needed.
3. **Until then:** snooze or turn off the reminder for that bill, or open the app (a cold start runs the pass even today).
