# Credit Card Model Revalidation — 2026-08-22

**Scope:** end-to-end revalidation of the issuer-style credit card model —
billing cycles, statement creation, payment capture/allocation, available
credit vs. limit, and every UI / net-worth consumer.

**Base:** `claude/credit-card-model-validation-f6f881` @ `a703360`, which
merges `origin/main` (`1e6765a`) and therefore includes `3ce02b3`
("fix: keep generated statements unpaid and restore available credit", PR #33).

**Type:** audit **and fix** pass. Five findings were fixed with regression tests
(CC-1 through CC-5). Everything else was verified and is reported below as
pass/fail with file:line, including the things that turned out to be correct.

---

## 1. Pipeline map (create → pay → allocate → available)

**Statement windows.** `shared/utils/billingCycle.ts:52` /
`shared/utils/dates.ts:89` — a card closes ON generation day `D`; the window is
`(previous D + 1) → D`, inclusive. `clampBillDay` pins `D=31` to the last
calendar day of the month; `D=30` stays the 30th in 31-day months.

**Create.** `shared/utils/autoCreditCardBills.ts:59`
(`previewClosedCycleCreditCardBill`) drafts a closed cycle as *gross* window
spend, min due ≈ 5% capped at the statement, due date = statement + 5d;
`collectAutoCreditCardBillDrafts` covers the last 12 closed cycles so a skipped
month still gets a document (CC-3).
`providers/CreditCardBillsProvider.tsx:330` (`generateAutoBills`) runs three
passes on app load / data-ready (debounced ~400ms) and on AppState: create
drafts → refresh auto unpaid bills whose window/amount drifted (re-date within
3 days) → align stored `amountPaid`/`paymentIds` to the ledger.

**Pay.** `components/accounts/PayCreditBillModal.tsx:174` writes an
`AccountPayment` (bank/wallet → card), then stamps the target statement via
`applyPaymentToBill` (`providers/CreditCardBillsProvider.tsx:548`), which *adds*
onto `amountPaid` and appends the payment id.

**Allocate.** `shared/utils/creditCardLedger.ts:254` (`buildCreditCardLedger`)
is the single source of truth. Payments sorted by (date, id); cancelled
statements skipped; never applied to `statementDate > payment.date`; linked ids
first, then oldest-first fill; leftover → `freeCredit` → reduces open-cycle
unbilled spend, else `unappliedCredit`. Stored `amountPaid` acts as a floor for
out-of-band settlements only (see finding CC-1).

**Available.** `availableCredit = max(0, creditLimit − unbilledSpend)`
(`shared/utils/creditCardLedger.ts:583`). `statementDue` (open statement
remaining) is tracked separately; `totalOutstanding = statementDue +
unbilledSpend` is what liabilities/net worth consume.

---

## 2. Gap table

| # | Sev | File | What's wrong | What should happen | Fixed? |
|---|---|---|---|---|---|
| CC-1 | **P0** | `shared/utils/creditCardLedger.ts:425` | The stored-`amountPaid` floor had no date guard and no provenance check, so on a non-auto (or PAID) statement it credited money that the allocation had *deliberately withheld* because the payment predated the statement — while the same money also stayed in `freeCredit`. The same rupees were counted twice. | The floor covers out-of-band settlements only (mark-as-paid with no ledger row), never money a linked `AccountPayment` already explains, and never on a statement that has not closed yet. | **Yes** |
| CC-2 | **P1** | `components/accounts/PayCreditBillModal.tsx:193` | The payment target came from `earliestOpenCreditCardBill` (sorted by `dueDate`, no date guard) and the **full** payment amount was stamped onto it. A backdated payment, or a manually created future-dated statement, wrote `amountPaid > 0` onto a statement the payment cannot settle; an overpayment wrote `amountPaid > statementAmount`. | Only stamp a statement whose `statementDate <= payment date`, and only up to what that statement still owes. The remainder is the ledger's cycle credit. | **Yes** |
| CC-3 | P2 | `shared/utils/autoCreditCardBills.ts:59` | `previewClosedCycleCreditCardBill` only ever drafted the *latest* closed cycle. If the app was not opened for two or more cycles, the older closed cycles never got a bill **document** — so no reminder was scheduled for them. | Draft every closed cycle that has spend but no document yet, bounded to 12 cycles. Position math was already unaffected (the ledger derives those windows regardless), so this is purely additive. | **Yes** |
| CC-4 | P2 | `shared/utils/accountBalance.ts:178` | `computeCreditUsage()` computed `availableCredit = limit − gross cycle spend`, ignoring statements, leftover credit and the ledger. No UI used it, but three tests did — and one of them asserted its wrong answer. | Delete it; the ledger via `computeOutstandingCredit` is the only source of truth. | **Yes** |
| CC-5 | P3 | `shared/utils/creditCardLedger.ts:559` | Spend under a **cancelled** statement fell back into `unbilledSpend`, so it reduced `availableCredit` even though it is not this-cycle spend — contradicting the spec rule `availableCredit = limit − unbilled (this cycle only)`. | Keep it owed (the existing intent) but in its own `cancelledSpend` bucket: counted in `totalOutstanding`, excluded from `unbilledSpend` and therefore from `availableCredit`. | **Yes** |
| CC-6 | P3 | `components/creditCardBills/CreateCreditCardBillModal.tsx:59` | `statementDate` / `dueDate` are free-text with no validation, so a manual statement can be dated arbitrarily (including the future). This is what made CC-1 and CC-2 reachable in practice. | Date validation on manual statement creation. Not a math defect once CC-1/CC-2 are fixed. | No — input-validation scope, not model scope |
| CC-7 | P3 | `shared/utils/magicParser.test.ts:44` | Pre-existing, unrelated flake: the test builds "yesterday" with `toISOString()` (UTC) and compares against a local-date parser, so it fails every day after 18:30 IST. Confirmed failing on the un-patched tree. | Use a local date key. | No — unrelated to credit cards |

### Explicit pass/fail on the requested hunt list

| Hunt item | Result |
|---|---|
| 1. UI subtracting `statementDue`/`totalOutstanding` from limit for "available" | **PASS** — none. `CardsList.tsx:92` uses `totalLimit − totalUsed` where `totalUsed` is `unbilledSpend` (`:89`); `AccountCreditHero.tsx:44` bars on `usedThisCycle`; `accounts/[id].tsx:373` passes `creditUsage.availableCredit`. |
| 2. Any path reducing `statementAmount` when a payment is recorded | **PASS** — statements are gross window spend (`autoCreditCardBills.ts:71`); the refresh pass rewrites amount from spend only, never from payments. |
| 3. Leftover credit stamping the newly generated statement | **PASS after CC-1 fix**. Was **FAIL** for non-auto statements: 28,101 statement + 19,000 payment dated before close showed `paid 19000 / remaining 9101 / partiallyPaid`, and the 19,000 *also* sat in `unappliedCredit`. Now `remaining 28101 / unpaid`, `unappliedCredit 19000`. |
| 4. Auto-bill refresh keeping a leftover `amountPaid` after walking the amount | **PASS** — `collectCreditBillAllocationPatches` walks auto non-PAID bills back to the ledger figure (`creditCardLedger.ts:557`), verified: patch `{amountPaid: 0, paymentIds: []}`. |
| 5. `applyPaymentToBill` → ledger refusing to walk back manual bills → stuck PARTIALLY_PAID | **FAIL, fixed** — this is CC-1 (ledger side) + CC-2 (write side). |
| 6. Double-counting spend across two windows, or a payment across two statements | **PASS** — for `D` ∈ {1, 20, 30, 31} over a spend set straddling every month boundary, `Σ billed + unbilledSpend === Σ spend` exactly. Consecutive windows are contiguous with no shared and no skipped day for `D` ∈ {1, 20, 28, 29, 30, 31} across 9–10 statements. A payment accumulates `credit` per statement so room shrinks; it can span statements but never double-applies. |
| 7. Month-end `D=31` / Feb / 30-vs-31 | **PASS** — `D=31`: Jan 1–31, Feb 1–28, Mar 1–31, Apr 1–30. `D=30`: Dec 31–Jan 30, Jan 31–Feb 28, Mar 1–30, Mar 31–Apr 30. `D=30` never becomes the 31st. |
| 8. Timezone (`todayDateKey(user tz)` vs UTC) | **PASS** — every credit consumer passes the user setting: `CardsList.tsx:44`, `AccountsList.tsx:129`, `accounts/[id].tsx:92`, `useUnifiedNetWorth.ts:75`, `PayCreditBillModal.tsx:107`, and the provider uses `todayDateKey(timezone)` on all three passes. |
| 9. Card with no `billGenerationDay` | **PASS** — `creditCardLedger.ts:275`: all spend unbilled, payments offset it, no statements emitted (even when bill documents exist). |
| 10. Cancelled statement spend | **PASS after CC-5 fix** — still owed (never vanishes), now in its own `cancelledSpend` bucket so it no longer eats the limit. |
| 11. Net worth dropping available-limit style instead of outstanding | **PASS** — `useUnifiedNetWorth.ts:110` and `AccountsList.tsx:179` both use `totalOutstanding`. |
| 12. Utilization using outstanding instead of unbilled | **PASS** — `CardsList.tsx:93,119` and `AccountCreditHero.tsx:44` both use unbilled. |
| 13. Web cron vs mobile repair | **NOT VERIFIABLE HERE** — no `netlify/` dir and no cron function in this checkout. Production statement generation still depends on the app being opened unless the `expense-tracker` web repo's cron is merged and deployed; that was not confirmable from this repo. |
| 14. Reminders local-only, cron sends no FCM | **NOTED, unchanged** — `reminderFrequency`/`nextReminderAt` are scheduled on-device; no push path. Not expanded. |
| 15. Tests encoding the OLD behavior | **PASS** — no test asserted leftover-applies-to-next-statement or `available = limit − totalOutstanding`. All 82 pre-existing tests in the four target files pass unchanged after the CC-1 fix. |

---

## 3. Fixes applied

### CC-1 — stored `amountPaid` floor double-counted ledger payments

`shared/utils/creditCardLedger.ts` — the floor block now:

1. skips statements whose `statementDate > today` (a statement that has not
   closed cannot have been settled — spec rule 3), and
2. counts only the part of `amountPaid` that **no linked payment explains**
   (`storedAmountPaid − Σ amounts of payments listed in paymentIds`), added on
   top of what allocation already placed rather than replacing it.

Failure scenario it fixes (Slice, `D=20`, limit ₹89,000): statement ₹28,101
closing 20 Aug, payment ₹19,000 dated 13 Aug stamped onto it.

| | before | after |
|---|---|---|
| statement | paid 19,000 / remaining 9,101 / PARTIALLY PAID | paid 0 / remaining 28,101 / unpaid |
| `statementDue` | 9,101 | 28,101 |
| `unappliedCredit` | 19,000 | 19,000 |
| `totalOutstanding` | 9,101 | 28,101 |

The ₹19,000 was counted twice before — net worth understated the card
liability by exactly that amount. This is also the reported
"₹28,101 shows PARTIALLY PAID / remaining ₹20,604" bug, reproduced with a
7,497 stamp and now returning `remaining 28,101`.

Out-of-band settlement still works: a bill with `amountPaid` and **no** linked
payment is treated as paid, and a part-ledger / part-off-app settlement
(4,000 via payment + 6,000 off-app on a 10,000 statement) resolves to paid.

### CC-2 — payment stamped onto a statement it cannot settle

`components/accounts/PayCreditBillModal.tsx` — resolve the target bill, then
only call `applyPaymentToBill` when `targetBill.statementDate <= paymentDate`,
and only for `min(paymentAmount, targetBill.remainingAmount)`. Prevents both
the bogus PARTIALLY_PAID stamp on a not-yet-closed statement and
`amountPaid > statementAmount` (which `credit-card-bills/[id].tsx:107` renders
raw as "Amount paid").

### CC-3 — statements only generated for the latest closed cycle

`shared/utils/billingCycle.ts` — `getClosedBillingCycle` takes a `cyclesAgo`
offset (0 = latest closed cycle) using the *same* month-offset derivation as the
ledger's `collectStatementWindows`, so a backfilled statement lands on exactly
the window the ledger already derives.

`shared/utils/autoCreditCardBills.ts` —
`collectAutoCreditCardBillDrafts` loops over
`AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES` (12, matching the ledger's
`DEFAULT_DERIVED_CYCLES`), oldest cycle first. Cycles with no spend produce
nothing, so a sparse history does not generate empty statements, and the
existing `existingBills` dedupe stops re-drafting.
`collectAutoCreditCardBillRefreshPatches` loops over the same range with a
`claimed` set, so the 11 backfilled documents are repaired when spend is
backdated into them — and two adjacent cycles can never fight over the same
document via the ±3-day near-miss match.

Two properties made this safe, both verified rather than assumed:

1. **No math changes.** With 5 months of spend and zero bill documents, the
   ledger *already* derives all five windows and reports
   `statementDue: 5000` with five open `source: "derived"` statements, while the
   old collector produced exactly one draft. Backfill only adds documents for
   cycles the ledger already treats as due — available credit, statement due and
   net worth are untouched.
2. **No notification burst.** `buildReminderSlots`
   (`shared/utils/creditCardBillReminders.ts:53`) filters `dateKey >= today` and
   caps the overdue horizon at 30 days past due. Measured slot counts for a 5%
   card: due +3d → 33 slots, due −28d → 3, due −58d → **0**, due −89d → **0**.
   Anything more than ~30 days past due schedules nothing, so only the
   immediately-prior cycle can notify — which is a genuinely overdue statement.

Backfilled statements are created normally (unpaid, reminders enabled), which is
consistent with the ledger already counting them as due.

### CC-4 — stale `computeCreditUsage` deleted

`shared/utils/accountBalance.ts` — removed. It defined available credit as
`limit − gross cycle spend`, which ignores statements, leftover credit and the
whole ledger. It had no live call site (verified again before deleting), but
three tests still exercised it and were migrated to `computeOutstandingCredit`.

Two of the three migrated with identical expectations. The third had been
asserting the stale function's wrong answer:

| scenario | `computeCreditUsage` | ledger |
|---|---|---|
| 5,000 spend, 6,500 paid (incl. external) | used 5,000, available 95,000 | used **0**, available **100,000**, credit balance 1,500 |

The card is fully paid with 1,500 of credit sitting on it, so 95,000 available
was simply wrong. Four now-unused imports in `accountBalance.ts` were dropped
with it.

### CC-5 — cancelled statement spend ate the limit

Cancelling a statement voids the document, not the debt — the existing comment
says the spend "is still owed, so it falls back here rather than vanishing", and
that intent is preserved. But it fell back into `unbilledSpend`, which is what
`availableCredit` subtracts, so cancelling a statement quietly reduced the
available limit by spend from a *closed* cycle. That contradicts the spec rule
"`availableCredit = creditLimit − unbilledSpend` (this-cycle unbilled only)".

`shared/utils/creditCardLedger.ts` now splits the spend no live statement covers
into two buckets at the open-window boundary:

- inside the open window → `unbilledSpend` (the only thing that eats the limit)
- before it → `cancelledSpend` (owed, in `totalOutstanding`, never in
  `availableCredit`)

Leftover credit settles the older `cancelledSpend` bucket first, then the open
cycle, then becomes `unappliedCredit`. `openCycle.spend` is now genuinely
open-window spend, which its own doc comment already claimed.

The available-credit **rule** is unchanged — `limit − unbilledSpend`. What
changed is that `unbilledSpend` now means what the spec says it means.

Because `AccountCreditHero` and `CreditCardListItem` both render a breakdown
that reads as a sum (unbilled + statement due = total outstanding), a
`Cancelled statements` row was added to the hero and a `· Cancelled` segment to
the card row, shown only when the bucket is non-zero. Without those the
displayed numbers would visibly stop adding up.

### Tests

`shared/utils/creditCardLedger.test.ts` — new
`buildCreditCardLedger — stored amountPaid floor` block, 5 cases: manual
statement not settled by an earlier payment; partial leftover stamp not
carried; mark-as-paid with no linked payment still honoured; out-of-band
top-up added on top of an allocated payment; a not-yet-closed statement never
settled.

`shared/utils/autoCreditCardBills.test.ts` — new
`collectAutoCreditCardBillDrafts — backfill` block, 8 cases: drafts every
closed cycle with spend oldest-first; skips cycles with no spend; does not
redraft a cycle that already has a statement; never drafts an unclosed cycle;
respects the cycle-depth bound; skips a card with no generation day; repairs a
backfilled older statement when spend is backdated into it; two cycles never
fight over the same document. `collectAutoCreditCardBillDrafts` had no test
coverage at all before this.

`shared/utils/creditCardLedger.test.ts` — new
`buildCreditCardLedger — cancelled statements` block, 5 cases: cancelled spend
owed without eating the limit; separated from open-cycle spend; leftover credit
settles the cancelled bucket before the open cycle; credit left unapplied once
both buckets clear; zero cancelled spend when every statement is live.

`shared/utils/accountActivities.test.ts` / `accountBalance.test.ts` — three
`computeCreditUsage` call sites migrated to `computeOutstandingCredit`, one with
a corrected expectation (see CC-4).

`shared/utils/billingCycle.test.ts` — new
`getClosedBillingCycle — cyclesAgo (statement backfill)` block, 5 cases:
contiguous walk-back; `cyclesAgo` 0 is the latest closed cycle; `D=31` clamps
through February (Mar 1–31, Feb 1–28, Jan 1–31); `D=30` stays the 30th in
31-day months; and a property check that across 11 backfilled cycles for
`D` ∈ {1, 20, 28, 29, 30, 31} consecutive windows are always exactly one day
apart — no shared and no skipped day.

```
npx vitest run shared/utils/creditCardLedger.test.ts \
  shared/utils/accountBalance.test.ts \
  shared/utils/autoCreditCardBills.test.ts \
  shared/utils/billingCycle.test.ts
→ 5 files (incl. accountActivities), 113 passed
```

Full suite: 851 passed, 1 failed — `magicParser.test.ts` (CC-7), confirmed
pre-existing on the un-patched tree. `npx tsc --noEmit` clean.

---

## 4. Still open

- **CC-6** — manual statement dates are unvalidated. Now harmless to the math
  (CC-1 and CC-2 mean a strange date can no longer corrupt available credit or
  statement due), but a user can still create a statement dated anywhere.
- **CC-7** — pre-existing timezone flake in `magicParser.test.ts`, unrelated to
  credit cards. Worth fixing because a daily-failing test masks real breakage.

## 5. Not changed, deliberately

- The available-credit **rule** (`limit − unbilledSpend`) is untouched. CC-5
  changed which spend counts as unbilled, not the rule.
- Cancelling a statement still leaves its spend owed. That was the existing
  intent and CC-5 preserved it; only the available-credit contamination was
  fixed. Note the consequence: that spend is never re-statemented, so it sits in
  `cancelledSpend` indefinitely. Whether cancelling should instead write the debt
  off, or roll it into the next statement, is a product decision this pass did
  not take.
