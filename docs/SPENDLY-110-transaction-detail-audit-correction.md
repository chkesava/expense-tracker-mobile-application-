# SPENDLY-110 — Journal transaction detail, audit trail and correction workflow

**Ticket:** [SPENDLY-110](https://kesavach.atlassian.net/browse/SPENDLY-110) (Task, High)
**Duplicate closed:** [SPENDLY-114](https://kesavach.atlassian.net/browse/SPENDLY-114), linked
**Epic:** [SPENDLY-102](https://kesavach.atlassian.net/browse/SPENDLY-102) Ledger Intelligence & Financial Journal
**Integration branch:** `ledger-v2` (PR targets `ledger-v2`, never `main`)
**Baseline:** `ledger-v2` @ `9eb5af4` (SPENDLY-109 + SPENDLY-111, synced with `main`)
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Status:** Implemented on `feat/SPENDLY-110-transaction-detail-audit-correction`. `npm test` (270 files / 3758 tests), `npm run typecheck` and `npm run typecheck:shared` all pass.

---

## 1. Context

SPENDLY-38 already built a genuine audit spine, which made this ticket smaller
and sharper than its description suggests:

* `users/{uid}/ledgerEvents` is an append-only journal of
  `{ kind, docId, action, before, after, actorUid, reason?, createdAt }` with
  full primitive snapshots either side of every change.
* `firestore.rules` denies `update` and `delete` on those events outright, so
  the trail is immutable at the database, not merely by convention.
* `updateExpense` / `updateIncome` / `softDeleteExpense` / `softDeleteIncome`
  each write the live row **and** its event in a single commit, guarded against
  already-removed and split-owned rows and against locked past months. Deletes
  set `deletedAt`; nothing is ever destroyed.

So the model was sound. Four things were missing, and this ticket adds them.

### 1.1 No restore path

Nothing cleared `deletedAt`. A soft-deleted row was preserved perfectly and
then invisible forever — the audit trail could tell you a transaction had been
deleted but gave you no way to act on that. For a mis-tap on a real expense,
the only recovery was re-entering it by hand, which loses the original id, its
history and anything referencing it.

### 1.2 `reason` was plumbed but never populated

`LedgerMutationOptions.reason` flows all the way into the stored event — and no
caller has ever set it. Every event in every user's history says only *what*
changed, never *why*. That is the difference between an audit trail and a
changelog.

### 1.3 No per-transaction history

`useLedgerEvents` streamed the entire collection with no `docId` filter, and the
Audit sub-tab listed changes app-wide with no link back to the transaction. You
could see that *something* was edited, but not open a transaction and ask what
had happened to it.

### 1.4 No related-record resolver

Nothing answered "what else is connected to this row" — the statement a card
purchase was billed to, the cashback credited against it, the trip or split or
subscription it belongs to, how it entered the ledger.

---

## 2. Design

### 2.1 Restore is a field clear, not a re-creation

`restoreExpense` / `restoreIncome` clear `deletedAt`, `deletedBy` and
`deletedReason` with `deleteField()` on the **original document**, so its id,
its event history and every reference to it survive. A `"restore"` event is
written in the same commit, recording who and why — symmetrical with the delete.

`assertRemovedAndRestorable` is the mirror of the existing
`assertLiveAndMutable`: the row must actually be deleted, and everything that
blocks an edit still blocks a restore — split-owned rows stay off-limits
(reversing those is SPENDLY-39), and a locked past month cannot be reopened
through the back door.

**The trip-spend symmetry is the subtle part.** `softDeleteRow` decrements
`trips/{id}.spentAmount` by the full amount. A restore that forgot to increment
it back would leave every restored expense permanently missing from its trip
total. A test asserts delete-then-restore returns the increment to zero net.

`"restore"` is a new member of the stored `LedgerEventAction` union. Because it
is stored, older documents carry only `"update" | "delete"` and a future build
may add more — so every renderer treats an unrecognised action as an edit
rather than dropping the event. Losing audit history would be worse than
labelling it imprecisely.

### 2.2 Diffing snapshots, not printing them

Storing full before/after snapshots is right — it survives schema drift and
needs no migration — but it is useless on screen: two complete records side by
side make the reader hunt for the difference.

`diffLedgerSnapshots` reduces a pair to the fields that actually changed, so
the trail says "Amount 500 → 650" instead of reprinting the row. Two
normalisation rules carry the weight:

* **`null` and `""` are the same absence.** `accountId` is `string | null`
  while `note` is `""`, so without this every event would report spurious
  changes on untouched fields.
* **Tags compare order-insensitively**, so reordering alone is not a change.

A delete returns *no* field changes rather than fifteen cleared fields —
callers render it as its own thing.

### 2.3 Related records are read-only, deliberately

This is where SPENDLY-111's hazard lives, from the other direction.

The Journal's spending figures are impossible to double-count because its row
set is exactly one record per `Expense` and one per `Income` (SPENDLY-109). A
credit-card purchase is already in that set — so the `AccountPayment` that
settled its statement is *the same rupees seen from the other side*. Surfacing
it is useful context; adding it to anything would double-count.

Every related record therefore carries an explicit `isSameMoney` flag, and the
UI prints "same money" beside those amounts plus a footnote. Only cashback is
genuinely separate money arriving, and `separateMoneyTotal` exposes exactly
that subset. A test asserts a bill payment contributes zero to it.

If a later ticket wants any of this in a total, it has to go through the
row-set rules in `journalActivities.ts` first — not through this file.

### 2.4 Per-transaction history without a new index

`useLedgerEvents` gained an optional `docId`, filtering **client-side** rather
than adding a `where` clause. A `where` + the existing `orderBy("createdAt")`
would need a composite index, and one row's history is a handful of documents
out of a collection the Audit tab already streams in full. The listener stays
mounted only while the sheet is open.

### 2.5 Restore lives on the Audit tab

Deleted rows are, by definition, absent from the Journal list — so the restore
affordance belongs where they are still visible: the Audit sub-tab, on the
delete event itself.

It is offered only when the delete is that row's **newest** event. A later edit
or restore means the row is already back, and offering Restore would fail on
`assertRemovedAndRestorable` and read as a broken button. `events` arrives
newest-first, so the first event seen per `docId` is its latest.

---

## 3. Files

**New**

| File | Purpose |
|---|---|
| `shared/utils/ledgerEventDiff.ts` | `diffLedgerSnapshots`, `summarizeLedgerEvent`, `selectEventsForRow` |
| `shared/utils/journalRelatedRecords.ts` | `findJournalRelatedRecords`, `separateMoneyTotal` |
| `components/ledger/JournalTransactionAudit.tsx` | a row's own history, inside the detail sheet |
| `components/ledger/JournalRelatedRecords.tsx` | the read-only related list |
| + two colocated `*.test.ts` | 58 new cases |

**Changed**

| File | Change |
|---|---|
| `shared/types/ledgerEvent.ts` | `"restore"` action, with a note on forward/backward compatibility |
| `shared/utils/ledgerRow.ts` | `NOT_REMOVED_LEDGER_MESSAGE` |
| `services/ledger/mutateLedgerTransaction.ts` | `restoreExpense`/`restoreIncome`, `assertRemovedAndRestorable` |
| `hooks/useLedgerEvents.ts` | optional `docId` scoping |
| `components/ExpenseList.tsx` | detail sheet: clock time, audit status, related records, history, correction reason |
| `components/ledger/LedgerAuditList.tsx` | restore action, reason display, `"restore"` label |

No Firestore rules change. `ledgerEvents` stays append-only — that is the point
of it, and a restore is a new event, never an edit to an old one.

---

## 4. Tests

68 new cases; the existing 3690 are the regression net.

* **`ledgerEventDiff.test.ts`** (27) — amount/multi-field changes in display
  order; `null` vs `""` vs whitespace treated as one absence (the spurious-diff
  trap); setting and clearing a field; tag reordering and falsy entries
  ignored; a delete yielding no field changes; delete/restore/edit summaries
  with and without a reason; **an unrecognised action falling through to
  "Edited" rather than vanishing**; `selectEventsForRow` not confusing an
  expense with an income of the same id, and preserving the hook's ordering.
* **`journalRelatedRecords.test.ts`** (31) — cashback found, labelled by kind,
  ignored when voided or linked elsewhere, and **the only relation counted as
  separate money**; the statement a purchase was billed to and the payments
  that settled it, all flagged `isSameMoney` so `separateMoneyTotal` is zero;
  cashback not mistaken for a bill payment; investment entries paired by
  account/date/amount with sub-cent tolerance and requiring a pairing key;
  split/trip/space/subscription with resolved-name fallback; SMS and statement
  provenance; display ordering; empties.
* **`mutateLedgerTransaction.test.ts`** (+8, now 23) — restore clears the three
  delete fields with `deleteField()` and reuses the original document; row and
  event in one commit; before/after equal; **delete-then-restore returns trip
  spend to where it started**; refuses a row that was never deleted, a
  split-owned row, a locked past month and a missing id; income restore touches
  no trip; a full delete → restore round trip.

**Not covered.** The four touched components have no render tests —
`components/` is outside the vitest `include` repo-wide. That gap is now
tracked as **SPENDLY-126**, raised from SPENDLY-111.

---

## 5. Manual verification

**Commands:** `npx expo start` — hot reload covers it. No build, native step,
rules deploy, index change or Netlify deploy; client-side only.

1. Journal → History → tap a transaction. The sheet now shows the clock time
   beside the date, and an audited/not-audited status for expenses.
2. On a transaction you have edited before, a **HISTORY** section lists each
   change as `field: before → after`. On an untouched row it reads "Never
   edited since it was added."
3. On a credit-card purchase that has been billed, a **RELATED** section shows
   the statement and any payments that settled it, each marked *same money*,
   with the footnote explaining they are not additional spending.
4. On an expense with cashback against it, the cashback appears **without** the
   *same money* marker — it is genuinely separate money that arrived.
5. Type a reason into "Reason for this correction", then delete. Go to the
   **Audit** sub-tab: the event shows your reason in italics.
6. On that same delete event, press **Restore**. The transaction returns to the
   Journal with its original id; the Audit tab gains a green *Restored* event;
   and the Restore button disappears from the delete event, because the delete
   is no longer that row's newest event.
7. **Trip integrity:** restore an expense that belongs to a trip and confirm the
   trip's spent amount returns to its pre-delete figure — not double-counted,
   not left short.
8. Try restoring while **Lock past months** is on, against an old transaction —
   it should refuse with the past-month message rather than silently succeed.
9. **Regression:** editing and deleting from the Journal, the swipe-to-delete
   gesture, and the account detail screen should all behave exactly as before.

---

## 6. Ticket hygiene

* SPENDLY-110 → **In Progress**; SPENDLY-114 closed as its duplicate and linked.
* PR targets **`ledger-v2`**, `SPENDLY-110` in the title, browse URL in the body.
* Stays **out of Done**: the code lives only on `ledger-v2` until the epic's
  final merge to `main`.
* Related tickets raised from this epic: **SPENDLY-126** (component render-test
  infrastructure), **SPENDLY-127** (remove `ExpenseList`'s dead summary card).
