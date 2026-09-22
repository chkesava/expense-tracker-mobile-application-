# SPENDLY-99 — User-confirmed recalculation of settled statements

**Ticket:** [SPENDLY-99](https://kesavach.atlassian.net/browse/SPENDLY-99)
**Follows:** [SPENDLY-97](https://kesavach.atlassian.net/browse/SPENDLY-97) §2.6 (the AC6 gap this closes), SPENDLY-38 §6.4 (why PAID bills are never rewritten automatically)
**Baseline:** `main` @ `1a45aca`

## 1. Why

`collectAutoCreditCardBillRefreshPatches` skips any bill whose status is `PAID`
or `CANCELLED`. That is deliberate: rewriting a settled `statementAmount` behind
the user's back desyncs `amountPaid`/`status` and can resurrect reminders on a
bill they consider closed. The consequence is that a wrong amount on a settled
statement is frozen permanently, with no way to correct it — including every
statement understated by the SPENDLY-97 staged-page race before that shipped.

This adds the only safe correction: a visible, user-confirmed one.

## 2. Decisions

### 2.1 Reminders — full re-derive

When the corrected statement exceeds what was paid, the bill stops being `PAID`
and reminders follow the normal rules. No special suppression.

This is safe by construction for the bills this feature mostly targets.
`buildReminderSlots` (`shared/utils/creditCardBillReminders.ts`) only emits
overdue slots up to 30 days past `dueDate` and filters every slot to
`>= today`, so a cycle older than that schedules nothing at all. Only a
recently-settled bill resumes reminding — which is correct, because the user
genuinely still owes money on it.

The confirm dialog says which of the two outcomes applies before the user
commits.

### 2.2 Audit trail — inline stamps, not a ledger event

`ledgerEvents` is typed `expense | income` with an expense-shaped
`LedgerEventSnapshot` (amount/date/month/category/…). A statement correction
does not fit it, and widening that union would change a shared schema plus the
Audit tab reader for one action.

Instead the correction stamps the bill itself, in the same write:

* `recalculatedAt` — ISO timestamp of the confirmation
* `previousStatementAmount` — what the statement said before

No Firestore rules change is needed: `billWellFormed` validates named fields
rather than an allow-list, so new fields pass as-is. **There is no rules deploy
leftover for this ticket.**

### 2.3 Dates are not touched

The preview matches a cycle by exact close date, or within
`REDATE_TOLERANCE_DAYS` when the bill day was edited — the same rule the
automatic pass uses. But the write only changes the amount, the minimum due and
the derived fields. Re-dating a settled statement is a different operation and
would move the reminder slots underneath the user.

### 2.4 The preview requires a complete ledger

`previewBillRecalculation` returns null while `expensesComplete` is false. A
staged first-paint page would understate the recomputation — the very bug that
produced most of these wrong statements. Offering a truncated read as a
"correction" would be worse than the problem.

## 3. Shape

| File | Change |
|---|---|
| `shared/types/creditCardBill.ts` | `recalculatedAt`, `previousStatementAmount` |
| `shared/utils/autoCreditCardBills.ts` | `previewSettledAutoBillRecalculation`, `isSettledAutoCreditCardBill`; `REDATE_TOLERANCE_DAYS` exported |
| `providers/CreditCardBillsProvider.tsx` | `previewBillRecalculation` (pure), `recalculateBill` (writes) |
| `hooks/useCreditCardBills.ts` | both exposed |
| `app/(app)/credit-card-bills/[id].tsx` | correction card + confirm dialog |

The card only renders when the preview is non-null — a settled auto statement
whose cycle now sums to something else. A correct statement shows nothing, so
this is not a permanent button on every settled bill.

## 4. Tests

`shared/utils/autoCreditCardBills.test.ts`,
`describe("previewSettledAutoBillRecalculation (SPENDLY-99)")` — corrected
amount and delta; null when already correct; null for a manual statement; null
for an open bill (the automatic pass covers those); CANCELLED is covered;
negative delta when the cycle shrank; close-date drift inside and outside
tolerance; another card's bill ignored; inputs never mutated.

`npm test` 3130/3130 pass. `npm run typecheck` and `npm run typecheck:shared` clean.

## 5. Not included

* No bulk "fix all settled statements" pass. Every correction is one bill, seen
  and confirmed.
* No backfill or migration. Statements already frozen at a wrong amount stay
  wrong until a user opens that bill and confirms.
* `useGamification` and the other truncation-adjacent paths are SPENDLY-98.
