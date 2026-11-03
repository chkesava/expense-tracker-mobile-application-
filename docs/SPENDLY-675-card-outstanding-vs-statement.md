# SPENDLY-675: card Total outstanding ≠ statement remaining

**State:** fix built on `fix/SPENDLY-675-card-outstanding-vs-statement`, awaiting UI review.

## Symptom
The Roar card's overview showed **Total outstanding ₹268.71**. Its statement for 10/02 → 11/01 and the billing-cycle history showed **₹505 billed, ₹0 paid, ₹505 remaining**.

## Diagnosis (read-only, production, 2026-11-02)
`scripts/reconcile-credit-card.ts` was run against the real card. The figures:

| Figure | Value |
|---|---|
| Stored `currentOutstanding` | ₹268.71 |
| Ledger statement due / total outstanding | ₹268.71 / ₹268.71 |
| Set-aside credit (`unappliedCredit`) | ₹0 |
| Rebuild verdict | consistent (no drift) |
| Nov statement: ledger paid / remaining | ₹236.29 / ₹268.71 |
| Nov statement: **stored** paid / remaining | **₹0 / ₹505** |
| Pending bill-pass write | Nov bill → amountPaid ₹236.29, paymentIds [cashback] |

**How ₹268.71 comes about.** The user recorded ₹392.29 of cashback on 10-08. Under the existing rule (cashback settles statements, oldest open first), it first cleared the ₹156 still owed on the Aug statement (₹4,536 billed, ₹4,380 paid). The remaining ₹236.29 settled the Nov statement, so ₹505 − ₹236.29 = ₹268.71. Nothing is inferred: the cashback is a recorded payment.

**Why the statement disagreed.**
- The overview reads the ledger, while the statement screen and cycle history read the stored bill fields.
- The stored fields are written only by the bill pass in `CreditCardBillsProvider`, which runs on first load and on app focus.
- The Nov bill was created after the pass last ran, so it kept its creation-time ₹0 until the next focus.
- Its random id, and the CANCELLED random-id duplicate beside every past auto bill, point to the legacy kesavaexpensetracker cc-bill cron. SPENDLY-676 covers that.

## Definition (documented here, per acceptance criterion 2)
- **Total outstanding** is `currentOutstanding`, the running total of every write to the card. It equals the ledger's statement due + unbilled spend + cancelled-statement spend − credit the ledger set aside (SPENDLY-497). It includes spends, fees and charges posted as expenses, payments, recorded cashback, refunds, adjustments and transfers.
- **Statement paid / remaining** is what the ledger allocated to that statement: payments, cashback and credits dated after the close. The rule that early payments don't pay a statement (SPENDLY-497, CC-9/CC-12) is unchanged.
- **"of which cashback"** is the part of the settlement that was provider cashback, shown separately so cashback is never presented as money paid.

## Fix
- **`shared/utils/creditCardBillView.ts`** (new, pure): `creditCardBillView(bill, ledger, payments, today)` returns the bill's paid, remaining, cashback share and status as the ledger allocates them. It falls back to the stored fields for cancelled bills or when no ledger is available. Status is recomputed only when the ledger's paid amount differs from the stored one; otherwise the stored date status (UPCOMING / DUE_SOON / OVERDUE) is kept.
- **`hooks/useCreditCardLiveUsage.ts`**: `useCreditCardLedger(card)` builds the ledger from the same inputs as the overview's live usage. It uses provider data only, so it adds no listeners.
- **Statement screen** (`app/(app)/credit-card-bills/[id].tsx`): status, amount settled, of which cashback, remaining, the Pay Bill gate and the pay default amount all come from the view.
- **Card screen** (`app/(app)/accounts/[id].tsx`): the open statement card, the reconcile modal's open bill and the billing-cycle history all use the view. The history now also passes the real cashback share; it was hard-coded to 0.
- **`providers/CreditCardBillsProvider.tsx`**: the bill pass re-runs once when a bill id it hasn't seen appears, so the stored doc catches up too. The run is bounded by the seen-ids ref and the fingerprint, and the allocation write stays compare-and-set.

There are no rules, schema or data changes, no backfill and no production writes. The stored Nov bill corrects itself the next time the app runs the pass.

## Tests
- `shared/utils/creditCardBillView.test.ts`: the Roar history end to end (Aug ₹156 and Nov ₹236.29 cashback split; statement remaining equals the card's statement due); unpaid; partial payment; full payment; a payment before close (still set aside); current-cycle spend; a refund (not counted as cashback); multiple statements; stored date status kept; cancelled duplicate and no-ledger fallbacks.
- `scripts/lib/cardReconcileReport.test.ts`: the diagnostic report, including stale-bill detection and pending allocations.
- The provider re-run trigger has no automated test, because the repo has no React Native component harness. It is covered by UI review.

## Follow-ups
- SPENDLY-676: the legacy cc-bill cron on kesavaexpensetracker creates random-id duplicate auto bills.
