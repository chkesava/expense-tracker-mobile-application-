# SPENDLY-319 — Fee anomaly, duplicate and reversal intelligence

**Ticket:** [SPENDLY-319](https://kesavach.atlassian.net/browse/SPENDLY-319) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-319-fee-anomaly-reversal`, cut from the epic branch after 318 and merged back with approval.
**Depends on:** 313–318
**Scope:** Spendly only. Adds one Firestore collection with its own rules.

---

## 1. What users see

A new **Worth a look** section on the Overview, and the same signals on each
fee's detail screen. Every signal has an icon, a title and a plain explanation
built from the records it rests on. It opens a sheet listing those records,
each of which opens its fee detail. The sheet has two actions: **Mark as
resolved** and **Not a problem — dismiss**. Informational signals only offer
**Hide this**. Dismissed signals can be listed again and restored.

| Signal | When | Severity |
|---|---|---|
| Possible double charge | Same fee family, account and amount within 3 days | attention |
| Higher than usual | Latest charge ≥ 1.5× the median of 3+ earlier charges, and at least ₹50 more | attention |
| Repeated penalty | 2+ late-payment / minimum-balance / cheque charges, or penal / bounce / over-limit subtypes, in the last 6 months | attention |
| Fee reversed / partly reversed | A counted reversal or refund is linked to the fee. The partial case says how much still counts | info |
| Reversal not matched | A credit looks like a reversal but is not tied to any fee, so it reduces nothing | attention |
| Needs a look | A record is uncertain because its signals conflict, its link broke, or the source changed after review | attention |

## 2. Design

### 2.1 Read-only by construction
`shared/utils/feeAnomalies.ts` is pure. It reads resolved fee records and
returns signals, and a test asserts it never mutates its input. Nothing in this
story writes to a transaction or to a fee review. The only write is the
dismissal.

### 2.2 Reversals only when supported
A reversal lowers fee totals only when the engine paired it with a specific fee
(314) or the user confirmed it (315). This was already enforced by the model; it
is now visible:

* "Reversal not matched" explains why an unsupported credit isn't reducing anything.
* A test pins the dashboard total unchanged in that case.
* "Partly reversed" states the amount that still counts.

### 2.3 Dismissal persistence: its own collection
The dismissal lives at `users/{uid}/feeSignalDismissals/{signalId}` rather than
on the fee review. A duplicate signal spans two records, and writing a review
would wrongly mark a fee as confirmed.

* The signal id is deterministic: `<kind>--<sorted record keys>`, with at most 12 records.
* A dismissal therefore sticks until the evidence changes. New evidence gives a new id, and the signal can surface again.
* Deleting the dismissal restores the signal.

The rules:

* owner and duress-twin only;
* the id must be `<kind>--[A-Za-z0-9_-]+`, bound to the body's `kind`;
* `kind` is a closed enum, mirrored from TS and pinned by the contract test;
* `resolution` is `dismissed` or `resolved`;
* `recordKeys` holds 1–12 entries;
* `hasOnly` means there are no money fields.

If the dismissals listener fails, every signal is shown rather than any being hidden.

### 2.4 Deterministic and testable
The same records produce the same signals in the same order: attention before
info, then newest first. Duplicate pairing is greedy and one-to-one.

### 2.5 No advice
Signals describe; they don't advise. The wording test forbids "switch",
"recommend", "better", "cheaper" and "should".

## 3. Files

| File | What |
|---|---|
| `shared/utils/feeAnomalies.ts` (+test, 18) | Signals, ids, active filter, per-record lookup |
| `services/fees/feeSignalStore.ts` | Dismiss / resolve / restore through the outbox |
| `hooks/useFeeSignals.ts` | Dismissals listener, derived active and dismissed lists, actions |
| `components/fees/FeeSignals.tsx` | Row, sheet, Overview section |
| `components/fees/FeeOverview.tsx`, `app/(app)/fees/[key].tsx` | Wiring |
| `firestore.rules`, `firestore/feeSignalDismissals.rules.test.ts` (3), `shared/utils/feeModel.rules.contract.test.ts` (+2) | Rules and tests |

## 4. Tests and validation

* `npm test`: 299 files / 4782 tests.
* `npm run test:rules`: 17 files / 480 tests.
* `typecheck` and `typecheck:shared` are clean.
* **Not yet checked on a device.**

**Deploy note:** this is a new rules block, so it needs the normal manual rules
deploy when the epic ships (`docs/FIREBASE_RULES_DEPLOY.md`). No index is needed.

## 5. Manual testing guide

1. Add `ATM WDL CHG` ₹23.60 twice, one day apart, on the same account. **Worth a look** should show *Possible double charge*.
2. Open it. Both transactions should be listed. **Not a problem — dismiss** hides it; **Show dismissed** then **Restore** brings it back.
3. Add `NON MAINT CHGS` ₹590 and an income `NON MAINT CHGS REVERSAL` ₹590. You should see *Fee reversed* (info), and the Overview's net fee for it should be 0.
4. Add an income `CHGS REVERSAL` ₹77 with no matching fee. You should see *Reversal not matched*, and the totals should be unchanged.
5. Open a fee detail that has a signal. **Worth a look** should appear at the top of the detail.
