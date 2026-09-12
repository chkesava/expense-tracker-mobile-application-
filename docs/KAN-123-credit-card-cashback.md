# KAN-123 — Credit Card Cashback & Statement Credits

Spendly could record a credit-card purchase but not the cashback the provider
gave back, so a fully cashed-back purchase kept showing as money owed and the
only way to make the app agree with the real statement was to edit or delete a
real expense.

## How it works

A cashback record is an `accountPayments` document with its own `sourceType`:

```
users/{uid}/accountPayments/{cashback_<derived>}
  fromAccountId: "cashback"      // sentinel — never a real account
  toAccountId:   <cardAccountId>
  sourceType:    "cashback"
  cashbackKind:  "statement_credit" | "reward"
  cashbackSource:"manual" | "statement"
  linkedExpenseId?, providerRef?, note?
  voidedAt?, voidReason?          // soft reversal
  amount, date, createdAt, updatedAt
```

This reuses the mechanism that already existed. Balance math debits an account
only when `fromAccountId` equals that account's id
(`paymentsFromAccount`, `shared/utils/accountBalance.ts`), so a sentinel reduces
the card's liability without moving any bank balance — the same way
`sourceType: "external"` already worked for "I already paid this".
`buildCreditCardLedger` allocates every credit with `toAccountId === card.id`
oldest-statement-first, so cashback settles statements, spills into cycle credit
and feeds `totalOutstanding` / `availableCredit` with **no new ledger maths and
no second ledger**.

### Accounting position

| | Effect |
|---|---|
| Original expense | Untouched. Still a real expense in history and analytics. |
| Card liability | Reduced by the cashback amount. |
| Bank balances | Unchanged — no money left an account. |
| Spending analytics | Unchanged. `analytics.ts` / `rangeAnalytics.ts` / `MonthlyAnalyticsView` read only expenses and incomes and never read `accountPayments`. |
| Income totals | Unchanged. Cashback is a liability reduction only, not income — so it is never double counted. |
| Bill payment | None created. A statement cashback clears reads "settled by cashback", not "paid". |

### Two behaviours worth knowing

1. **Credit beyond what the card owes is dropped by the ledger** — a deliberate
   existing decision (`creditCardLedger.ts`: credit that outlives every debt is
   not carried as a balance). An oversized cashback would therefore be accepted
   and then silently vanish, so entry caps at the current outstanding and says
   what that is.
2. **A statement credit settles the statement it lands on**, stamping the
   cashback id into the bill's `paymentIds` / `amountPaid`. That is the intended
   "₹299 purchase + ₹299 cashback = ₹0, no bill payment" outcome; only the
   wording changes, never the maths.

### Safety

- **Idempotent by construction.** The document id is derived from card, date,
  amount, kind and linked purchase, so a double-tap, a retry after a dropped
  connection, or the same entry on a second device is one `setDoc` over one
  document. A genuinely repeated identical credit requires explicit
  confirmation, which adds a discriminator.
- **Reversal, not deletion.** Corrections set `voidedAt`. The ledger skips
  voided rows; the record stays on file.
- **Duplicate-credit guard.** A `statement_credit` may not exceed its linked
  purchase, and repeated credits may not add past it. A general `reward` is not
  tied to a purchase and is not held to that limit.
- **Authorization.** `accountPayments` is already owner-only under the recursive
  grant in `firestore.rules`; no rule change was needed and the boundary is now
  asserted in `firestore/personalData.rules.test.ts`.
  Field-level validation (locking `toAccountId` / ownership) is **not** included:
  it requires excluding `accountPayments` from the recursive match, the exact
  manoeuvre that previously broke `list` on every personal collection, and
  belongs with the KAN-79..120 rules workstream.

## Where it appears

- **Transactions → Cards → a card → Record cashback** (beside Reconcile statement).
- Card hero: **Cashback this cycle**, when there is any.
- Activity feed: a credit row labelled **Cashback**, never "Bill payment".
- Past billing cycles: a **Cashback** line, and **SETTLED BY CASHBACK** in place
  of PAID where cashback cleared the statement.
- Statement detail: "Amount settled" with an **of which cashback** row.
- Reconcile statement: an unlogged statement credit offers **Cashback**.

## Automated tests

```
npm test            # 2340 pass — incl. shared/utils/cashback.test.ts (27)
npm run test:rules  # 177 pass — incl. 5 new cashback ownership cases
npm run typecheck && npm run typecheck:shared
```

`shared/utils/cashback.test.ts` covers the ticket's acceptance scenario with its
own numbers, the partial case, void-then-rebuild, the deterministic-id retry,
every validation rejection, and the statement-history split.

## Manual testing guide

No commands needed beyond `npx expo start` — hot reload covers all of it. Use a
credit card account with a credit limit and a bill generation day set.

### 1. The acceptance scenario
1. Transactions → Cards → open a credit card. Note its available credit.
2. Add a ₹299 expense on that card. Outstanding shows ₹299; available credit
   drops by ₹299.
3. Tap **Record cashback**. Amount ₹299, type **Statement credit**, link the
   ₹299 purchase. Save.
4. Expect: outstanding **₹0**, available credit back to the full limit, the
   ₹299 expense still in history unchanged, and **no** bill-payment row.
5. Analytics → this month: still shows the ₹299 spent. Income totals unchanged.

### 2. Partial cashback
On a fresh ₹299 purchase record ₹100 → remaining liability **₹199**, and the
linked-purchase hint reads "199 … still eligible".

### 3. The guards
- Try an amount larger than the outstanding → refused, naming what is owed.
- Try a second ₹299 statement credit on a purchase already fully credited →
  "already been fully cashed back".
- Switch type to **Reward** and the purchase limit no longer applies.
- Record on a card that owes nothing → refused with the reason.

### 4. Duplicates and retries
- Submit the same cashback twice (same card/date/amount/purchase) → the second
  attempt asks "Already recorded?". Cancel leaves one record; **Record anyway**
  creates a genuine second one.
- Double-tap the save button → one record only.

### 5. Offline
Airplane mode → save. The toast reads as queued/saved-on-device. Re-enable the
network and confirm it syncs and the balance is right, not double-applied.

### 6. Presentation
- Card hero shows **Cashback this cycle**.
- The activity row reads **Cashback**, is a credit, and shows "Cashback" as the
  counterparty — not "Already paid" and not "Bill payment".
- For a cashback in a closed cycle, Past billing cycles shows a **Cashback**
  line and **SETTLED BY CASHBACK**; the statement detail shows "Amount settled"
  and "of which cashback".

### 7. Reconciliation
Reconcile statement with a CSV containing a credit line the app has no record
of → the row offers **Cashback**; confirm and the gap closes without any prompt
to edit the original purchase.

### 8. Regression — none of this may change
- Pay a bill from a bank account: the bank balance drops, the row still reads
  "Bill payment", and "Paid this cycle" counts it (cashback does not).
- Pay via "Already paid" / external: still reads "Already paid".
- Mark a bill as paid; generate a statement; open past billing cycles.
- Check a bank/cash account detail screen: no cashback row appears on it.
- Net worth and the dashboard are unchanged for cards with no cashback.

### 9. Platforms
Check a small Android phone (the card screen's two action buttons share a row)
and web (`npm run web`). Expense and Nutrition are untouched — nothing in this
change is shared with them; the Ganesh UI does not use these modules.

## Deployment note

**No Firestore rules or index deploy is part of this work.** No rule changed.
One Firebase project serves dev and prod with no staging, and
`firestore.indexes.json` is a subset of the live project, so any deploy needs
its own diff and an explicit go-ahead.
