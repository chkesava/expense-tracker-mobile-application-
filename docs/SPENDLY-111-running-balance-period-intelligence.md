# SPENDLY-111 — Ledger running balance and period intelligence

**Ticket:** [SPENDLY-111](https://kesavach.atlassian.net/browse/SPENDLY-111) — *Ledger running balance and period intelligence* (Task, High)
**Epic:** [SPENDLY-102](https://kesavach.atlassian.net/browse/SPENDLY-102) Ledger Intelligence & Financial Journal
**Integration branch:** `ledger-v2` (PR targets `ledger-v2`, never `main`)
**Baseline:** `ledger-v2` @ `23856aa` (SPENDLY-109)
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Status:** Implemented on `feat/SPENDLY-111-running-balance-period-intelligence`. `npm test` (267 files / 3683 tests), `npm run typecheck` and `npm run typecheck:shared` all pass.

---

## 1. Context

SPENDLY-109 gave the Journal search and filtering. It still could not answer
"how did this period go?" — the only totals on screen were `ExpenseList`'s
Spent / Income / Net card, which is three unrounded `reduce` calls over whatever
arrays it was handed (`ExpenseList.tsx:175-180`), with no rounding, no cash-vs-
credit distinction and no period breakdown.

This ticket adds cumulative balance context per row and daily / weekly / monthly
period intelligence, and replaces that card with something that reconciles.

---

## 2. Design

### 2.1 The hard part: the Journal cannot have a "balance after"

The per-account screen shows a true `runningBalance`, seeded from that account's
`openingBalance` and accumulated forward (`accountBalance.ts:542-565`). Two
things make that impossible here:

1. **The Journal spans every account.** There is no single opening balance to
   seed from, and summing several accounts' openings would produce a number
   that reconciles with no account the user can actually open.
2. **The Journal holds only expenses and incomes** (SPENDLY-109). Transfers,
   bill payments and cashback move real money but are `AccountTransfer` /
   `AccountPayment` rows, deliberately absent from the row set. A cumulative
   total over what *is* present could never equal an account balance.

Note the existing code already refuses this for credit cards: the accumulation
loop is skipped entirely when `kind === "credit"`, because a card figure is a
liability derived from billing-cycle allocation, not a ±accumulation.

**So this computes cumulative net *cash flow* across the rows in view** — "how
much has moved, and which way, up to this row" — and labels it as movement
rather than as a balance everywhere it surfaces. It reconciles exactly with the
visible transactions, which is what the acceptance criterion asks for. Confirmed
with the reporter before building.

### 2.2 Credit cards are never cash

A card purchase is an ordinary `Expense` whose `accountId` points at the card,
so it *is* in the Journal — but it takes nothing out of a bank. Every row is
therefore classified by the kind of account it hit:

```ts
journalCashImpact(record) // { cash, card }
```

* credit account → `{ cash: 0, card: ±amount }` — liability moves, cash does not
* anything else, **including a row with no account at all** → `{ cash: ±amount, card: 0 }`

Cash is the fallback when the account kind is unknown, because the common
account-less row is genuinely cash spending. The classification needs the
account's *type name* (`getAccountKind` matches on it), so `buildJournalRecords`
now takes `accountTypes` and stamps `accountKind` on each record. Without it
nothing is provably a card and everything counts as cash — documented and
tested.

### 2.3 Period totals: accrual and cash, side by side

Per the reporter's decision, **a card purchase counts in `spent`** — it is real
spending — **and is also reported separately as `cardSpent`**, so the user can
see why cash did not move by that amount. Each bucket carries both views:

| Field | Meaning |
|---|---|
| `spent` | every expense row, card purchases included |
| `cardSpent` | the part of `spent` that went on a card |
| `income` | every income row |
| `net` | `income - spent` — the headline performance figure |
| `cashIn` / `cashOut` | money that actually moved |
| `netCash` | `cashIn - cashOut`; ties to the running cash-flow line |

`summarizeJournalPeriods` buckets by `day`, `week` or `month`, newest bucket
first, emitting **only buckets that contain rows** — an empty week is not
invented. Week boundaries honour the user's `firstDayOfWeek` setting via the
existing `startOfWeekDateKey` / `endOfWeekDateKey`.

### 2.4 Why these totals cannot double-count

The ticket asks for transfers, bill payments and cashback to be handled without
double counting. They are **structurally absent** from the Journal's row set:

* transfers → `AccountTransfer`
* credit-card bill payments → `AccountPayment` (`sourceType: "account" | "external"`)
* cashback → `AccountPayment` with `sourceType: "cashback"` and the
  `CASHBACK_SOURCE_ID` sentinel, so it reduces a card without touching any bank

None of them is an `Expense` or an `Income`, so none can reach these totals. The
guarantee is a property of the row set rather than a filter someone could forget
to apply. The trap to remember is the reverse: **adding a bill payment into the
Journal later would double-count it against card spend**, since the purchase is
already there. That is called out in the file header of
`journalPeriodSummary.ts`.

### 2.5 Ordering had to match the list exactly

`ExpenseList` sorts rows with `postingSortMs(date, time, createdAt)`. The first
version of the accumulator used `postingSortMs(date, time)` — the comparator
`buildAccountActivities` uses, since `AccountActivity` has no `createdAt`. For
two same-day rows with no clock time that produces a *different* order, and the
cumulative figures would have appeared to jump around instead of stepping
monotonically down the screen. `JournalRecord` keeps the underlying row, so the
accumulator now sorts on `createdAt` too, with a deterministic id tie-break.
Two tests pin this.

### 2.6 One summary card, not two

`JournalPeriodSummary` supersedes `ExpenseList`'s built-in card, which is now
switched off for the Journal (`showMonthSummary={false}`). Keeping both would
have put two different Spent figures on one screen — the old one unrounded and
claiming to be the month's even when the view was filtered.

The new card refuses to render any figure while the ledger is still the staged
300-row page, showing "Period totals paused" instead. A total from a truncated
ledger is worse than no total because it looks authoritative. Same reasoning as
`assessCardAnalyticsCompleteness`. The per-row cash-flow column is likewise
withheld until the ledger is complete.

### 2.7 Out of scope

The **true** per-account "balance after" column, shown when the user filters to
exactly one non-credit account, was considered and deliberately not built — the
reporter chose the cash-flow model for the all-accounts view. It remains a clean
follow-up on top of `buildAccountActivities`.

---

## 3. Files

**New**

| File | Purpose |
|---|---|
| `shared/utils/journalRunningBalance.ts` | `journalCashImpact`, `buildJournalRunningBalance`, `journalCashFlowById` |
| `shared/utils/journalPeriodSummary.ts` | `summarizeJournalTotals`, `summarizeJournalPeriods`, `emptyJournalTotals` |
| `components/ledger/JournalPeriodSummary.tsx` | the card, with day/week/month toggle |
| + two colocated `*.test.ts` | 42 new cases |

**Changed**

| File | Change |
|---|---|
| `shared/utils/journalActivities.ts` | `accountKind` on `JournalRecord`; `JournalAccount` type; optional `accountTypes` option |
| `shared/utils/journalFilterPipeline.ts` | returns `runningBalance`, `totals`, `periods`; takes `accountTypes`, `granularity`, `firstDayOfWeek` |
| `components/ExpenseList.tsx` | optional `cashFlowById` column |
| `app/(app)/ledger.tsx` | `useAccountTypes`, granularity state, mounts the card, drops the old summary |

---

## 4. Tests

42 new cases; the existing 3641 are the regression net.

* **`journalRunningBalance.test.ts`** (20) — cash impact for bank / card /
  wallet / account-less rows and for a credit posted to a card; the
  unknown-types fallback; accumulation oldest→newest returned newest-first;
  **reconciliation** (the newest row's figure equals `netCashFlow`); card spend
  provably leaving the cash line untouched; `roundMoney` after every step;
  same-day ordering by clock time, by `createdAt`, and the deterministic id
  tie-break; monotonic stepping down the rendered order; input array not
  mutated; month-boundary continuity; 20 000 rows with no drift.
* **`journalPeriodSummary.test.ts`** (22) — spent/income/net; card spend counted
  in `spent` but out of `cashOut`; accrual vs cash kept separate; soft-deleted
  rows excluded; float residue rounded; `net === income - spent` and
  `netCash === cashIn - cashOut` invariants; month bounds including leap
  February and 30-day April; first/last day of month inclusive and one day
  either side falling into neighbouring months; bucketing by `date` not the
  stored `month`; Monday and Sunday week starts; week-boundary splits;
  daily buckets emitted only where rows exist; **reconciliation** — bucket
  totals sum back to the overall totals, and every granularity yields the same
  spend; 25 000 rows across months in one pass.

**Not covered.** The card component itself has no render test — `components/`
is outside the vitest `include`, as it is for the whole repo. Its logic lives in
the two pure utils above; only layout is untested.

---

## 5. Manual verification

**Commands:** `npx expo start` — hot reload covers it. No build, native step,
rules deploy, index change or Netlify deploy; this ticket is client-side only.

1. Journal → History. Below the filter bar a **This view** card shows Spent /
   Income / Net for the rows currently in view, with a Daily / Weekly / Monthly
   toggle.
2. Each transaction row now carries a small cumulative figure under its amount.
   Scroll from the bottom up and confirm it steps consistently — it is the
   running cash flow, not an account balance.
3. Add or filter to a **credit-card** expense. Confirm it raises **Spent**, that
   the card notes "Includes ₹X on cards, which has not left your accounts yet",
   and that **Net cash movement** does *not* move by that amount.
4. Switch the toggle between Daily, Weekly and Monthly. The bucket list changes;
   the three headline totals do not, because they cover the same rows.
5. Change **first day of week** in Settings and confirm the weekly buckets
   re-cut (Monday vs Sunday start).
6. Apply a filter or a search. The card follows the filtered rows — it is
   labelled "This view", so it is honest under any filter.
7. On a ledger with **>300 rows**, cold-start: the card reads "Period totals
   paused" and the per-row figures are absent until the full history lands.
8. **Regression:** the account detail screen and credit cards are untouched;
   `ExpenseList`'s own summary card is now off for the Journal, so there should
   be exactly one set of totals on screen.
9. Web and a small Android screen: the granularity chips and the period rows
   should not overflow.

---

## 6. Ticket hygiene

* SPENDLY-111 → **In Progress**; branch
  `feat/SPENDLY-111-running-balance-period-intelligence` off `ledger-v2`.
* PR targets **`ledger-v2`**, `SPENDLY-111` in the title, browse URL in the body.
* Stays **out of Done**: the code lives only on `ledger-v2` until the epic's
  final merge to `main`.
* Follow-up candidate: the true per-account "balance after" column when the
  Journal is filtered to a single non-credit account (§2.7).
