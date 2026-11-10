# SPENDLY-732 — The credit card bill pass never runs for ledgers of 300+ expenses

Bug, follow-up to SPENDLY-719 (relates). Branch `fix/SPENDLY-719-followup-bill-pass-staged-ledger` from `main`.

## The report (2026-11-09)
After SPENDLY-719 shipped (web from c68865e9, Expense v5.2.3 build 137), the web app's CC Bills → Current bills still lists the Roar card's 1 Nov statement (due 2026-11-06) as open.

## Evidence (read-only production reads, 2026-11-09)
- `scripts/reconcile-credit-card.ts` for the Roar card: the stored bill is unchanged since 2026-11-08. It still shows `amountPaid` ₹268.71, PARTIALLY_PAID, ₹236.29 remaining, and `paymentIds` without the cashback. The ledger allocates ₹505, and "the pass would write" `amountPaid` ₹505 with the cashback id.
- The bill's `updatedAt` is 2026-11-02T17:09Z (the payment stamp). No bill in the account was written after that.
- `system_settings/global.readModel`: every collection is `shadow`. The pass reads Firestore listeners, not the on-device copy, so a stale copy isn't the cause.
- The account has 902 expenses (531 of them on credit cards).

## Root cause
`generateAutoBills` (`providers/CreditCardBillsProvider.tsx`) and its first-load trigger were gated by `canRunAutoCreditCardBillGeneration`, which requires `expensesComplete`.

SPENDLY-409 (a6ce591c, 2026-10-06) made the 300-row staged expenses listener permanent and removed the idle upgrade to the full ledger. Since then, `expensesComplete` becomes true only in two cases:
- the whole ledger has fewer than 300 rows; or
- the user loads all history (Journal "load all", export).

So for this account the bill pass never ran in normal use, on web or Android. The pass does all of these, and none of them happened:
- statement creation;
- refresh;
- payment and cashback allocation;
- duplicate merge.

The SPENDLY-719 fix sits inside that pass, so it never ran either. Device QA passed because the emulator ledger has fewer than 300 rows.

## Fix
`billPassInputPlan` (in `lib/readModelLocal/billPass.ts`, pure and tested) decides where the pass reads its inputs:

| Screen state | Plan |
|---|---|
| Whole ledger, Firestore listeners | `screen`: unchanged |
| Whole ledger, some input from the copy | `checkScreenThenFirestore`: unchanged (SPENDLY-597) |
| Staged page (not complete) | `firestore`: `loadAuthoritativeBillInputs` reads every credit card's expenses by equality query, plus accounts, types, payments and bills |

- The pass then runs unchanged on those inputs. It keeps its compare-and-set (SPENDLY-497) and its read-model hooks, and it never runs on a partial ledger (SPENDLY-97).
- The gate is now `billPassListenersReady`: bills, expenses and payments have delivered.
- **Read budget:** a `firestore` pass costs about 600 reads on this account. `billPassThrottled` runs background triggers (app focus, a new bill id) in that plan at most once per 30 minutes. The session's first pass and passes requested after a money action (`requestBillPass`) always run.
- The timer now calls the latest pass through the ref, so a pass scheduled on the cache's staged page uses the whole ledger if the server snapshot completed it in the meantime.

No new collection, field or writer, so there is no read-model mapping, migration or allowlist change.

## Tests
- `lib/readModelLocal/billPass.test.ts` (SPENDLY-732) covers:
  - the plan for each screen state;
  - the listener gate;
  - the throttle;
  - the reported Roar shape on Firestore inputs read as work;
  - a source guard that the provider no longer gates on `canRunAutoCreditCardBillGeneration`.
- The guards still pass:
  - `lib/readModelWriteHooks.test.ts`;
  - `lib/readModelLocal/providerSwitch.test.ts`;
  - `lib/readModelLocal/listenersOff.test.ts`;
  - `shared/utils/autoCreditCardBills.test.ts`;
  - `shared/utils/creditCardLedger.test.ts`.

## Owner actions
1. Review and merge. Then release Expense and deploy web (both are your call).
2. Open the fixed app once, online. The first pass reads Firestore and writes the Roar bill to `amountPaid` ₹505, PAID, through the normal path. No repair script is needed.
3. Confirm by re-running the read-only `scripts/reconcile-credit-card.ts`.

**Until then, a workaround on the current build:** open Journal and load all history (or run an export). That completes the ledger, and the next app focus runs the pass.
