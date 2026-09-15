# SPENDLY-72 — the current contribution lifecycle

[SPENDLY-72](https://kesavach.atlassian.net/browse/SPENDLY-72) · Bug ·
High / Financial Integrity

Read [`EPF.md`](EPF.md) first. This is the decision record for why the Current
tab works the way it now does.

---

## What was reported

An establishment starting January 2026 and still active:

- September 2026 — the month in progress — read **Manual**.
- Other months read **Draft**.
- **Record credit** failed with *"Cannot move a draft month to credited."*
- The Current summary said **₹0 credited** while the rows plainly held money.

## What it actually was

Four separate defects that happened to land on one screen. Worth writing down,
because fixing any one of them alone would have left the screen wrong.

**1. Backfill owned months that were not history.**
`contributionMonthsFor` runs `dateJoined → currentMonth`, and `EpfBackfillScreen`
passed `epfCurrentMonth()`. So Backfill generated the *in-progress* month, and
**Save all** wrote it `confirmed` — rendered "Manual". The premature credit came
from Backfill, not the scheduler. `planScheduledContributions` was innocent
throughout: it caps at `throughMonth` and only ever writes `expected`.

**2. Those rows were lifecycle dead ends.** `ALLOWED` had `draft: []` and
`confirmed: ["missed", "reversed"]`, so `applyTransition` rejected both
`draft → credited` and `confirmed → credited` — the reported toast. Rows written
by Backfill also carry no `expectedCreditFrom/To`, so they could not age either.

**3. Current counted a different set than every other screen.**
`summariseLifecycle` added to `creditedTotal` for `credited | partial` only,
while `BALANCE_BEARING_STATUSES` — used by History, Balance and the portfolio —
is `credited | partial | confirmed`. A tab full of `confirmed` months therefore
headlined **₹0** and a real number everywhere else.

**4. Auto-credit fabricated credits.** `contributionsToAutoCredit` advanced
`expected → credited` once `today > expectedCreditTo`. It was labelled
"Credited · projected" — but the label never reached the balance, because
`isBalanceBearing` counts `credited`. A contribution nobody had observed was
reported as money in the fund.

A fifth surfaced while writing the reconciliation test: `summarizeContributions`
summed `epfCredit` and ignored `creditedAmount`, so a `partial` month headlined
its full projection on History and Backfill while Balance, interest and the
portfolio all counted the shortfall. Four screens, two answers.

---

## Decisions

### Auto-credit is removed, not relabelled

The honest label was the wrong fix, because the dishonesty was in the data, not
the words. There is now **no automatic transition anywhere in the module**. If
a future change adds one back, `lifecycle.test.ts` has an assertion positioned
to catch it.

The cost is real and was accepted: someone who never records anything now sees
a growing column of Overdue months instead of a balance that climbs on its own.
That is the correct answer — Spendly cannot see EPFO, and a balance that grows
without input is a number with nothing behind it.

### The calendar reading is derived, never stored

`expected` means three things depending on the day: not happened yet, not due
yet, past due. Adding `overdue` to `EpfContributionStatus` would have meant an
enum change, a migration, and a write pass that has to be idempotent and can
race the cron.

`deriveMonthState()` makes it a pure function of `(row, todayKey, currentMonth)`
instead. No migration, nothing to make idempotent, and — the part that matters —
a projection cannot leak into a balance, because `isBalanceBearing` still sees
`expected`.

It also splits the module cleanly: `lifecycle.ts` owns transitions,
`monthState.ts` owns readings. Keeping them in separate files is what stops a
calendar reading from becoming a stored fact again.

### Overdue fires at the 25th; the due date shown is the 15th

`epfCreditWindow.ts` already encoded both: the 15th is EPFO's statutory
deadline, the 25th is the grace end for employers who remit late. The ticket's
acceptance criterion asks for the 15th, and that is the date the UI shows via
the new `statutoryDueDate()`.

Firing **Overdue** on the 16th would have flagged most healthy months — real
employers remit through the window, which is why it exists. So the chip says
"due 15 Oct" from the moment the month closes, and only turns to Overdue after
the 25th.

### Backfill stops at the last closed month

`backfillThroughMonth()` returns the previous month for a live employment and
the current month otherwise. An employment that *ended* this month can still be
backfilled through its final month — that month became history the moment the
person left.

`contributionMonthsFor` itself is unchanged: `monthsToGenerate` and the
scheduler still need the current month, or nothing would ever create the row
Current is built around.

### `confirmed → credited | partial` is now legal

This is the one decision that widens rather than narrows, and it needs the
justification. A backfilled month is user-asserted history and still may not be
*rewritten* by the lifecycle — but attaching the credit that actually landed to
a month someone typed **adds** a fact rather than reversing one, and
`applyActualCredit` demands both an amount and a date before it will.

Without it the reported repro could not be closed: the existing September row
is `confirmed`, and the user would have had to delete and regenerate it to
record the real credit.

`draft: []` stays. A draft is not yet a claim about anything.

### Current keeps `Record credit` only

The ticket notes Backfill has Save draft / Save all and Current does not, and
asks for a coherent path. The coherent path was to narrow Backfill's range, not
to widen Current's controls: two bulk write paths over one document is how the
screens disagree in the first place. Backfill is the entry surface, Current is
the lifecycle surface, and both read the same records.

### Refused transitions explain themselves

`transitionRejectionMessage()` replaces `"Cannot move a ${from} month to
${to}."` — a sentence that named what the code refused and nothing about what to
do instead. `EpfCreditSheet` also now hides actions `canTransition` would
refuse, so the sheet cannot offer a button guaranteed to fail. Entered data was
already safe: `applyTransition` returns `false` and the sheet only closes on
`true`.

---

## Data already written

Two selectors in `creditWindowRepair.ts`, riding the repair pass the client and
the cron already run. Both are idempotent by construction, and both are pure —
the values they need are functions of data already stored, which is why this is
a repair and not a migration script.

| Selector | Finds | Writes |
|---|---|---|
| `contributionsWithFabricatedCredit` | `credited` + `source: simulated` + no `reconciledAt` + no `creditedAmount` | back to `expected`, event reason `auto-credit withdrawn (SPENDLY-72)` |
| `contributionsNeedingLifecycleRepair` | `draft` in the current or a future month | to `expected` with its credit window, event reason `current-month draft released to the scheduler (SPENDLY-72)` |

Unlike the SPENDLY-1 window repair, both write an `epfContributionEvent`: these
are status changes, and a withdrawal *lowers a reported balance* without the
user touching anything. That has to be traceable.

**A hand-recorded credit is never withdrawn.** `applyActualCredit` always stamps
`reconciledAt`, and the selector requires its absence.

`confirmed` months are deliberately **not** healed, even in the current month.
The user typed those, they are already balance-bearing, and
`confirmed → credited` now gives them a way to take the real credit.

> **The reported balance will fall** for anyone holding auto-credited months.
> That is the ticket's point, and it belongs in the release note.

---

## Reconciliation, pinned as a test

`monthState.test.ts` asserts that `summariseLifecycle().creditedTotal` equals
`summarizeContributions()` over the same balance-bearing rows. The two agree by
construction — both go through `isBalanceBearing` and `creditedSplit` — rather
than by two lists being kept in step by hand. That is the acceptance criterion
about Current, History, Backfill and Balance reconciling, written down somewhere
that fails the build.

`creditedSplit()` was extracted from `epfPortfolioSummary`, which had been
scaling the employee/employer split by `creditedAmount / epfCredit` since
KAN-71. `summarizeContributions` now uses the same helper. `total` stays
unscaled: that is the payslip view — what was deducted — and it is true whatever
later reached the fund.

---

## Not done

Offline queue behaviour and multi-device conflict resolution are on the ticket's
investigation list. They are properties of the existing `commitWrite` path and
are unchanged here. Nothing in the manual pass suggested otherwise; if something
turns up, it is a separate ticket.
