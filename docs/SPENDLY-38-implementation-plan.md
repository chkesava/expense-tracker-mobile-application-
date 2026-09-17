# SPENDLY-38 — Implementation plan

**Ticket:** [SPENDLY-38](https://kesavach.atlassian.net/browse/SPENDLY-38)
**Finding:** DI-06 (MEDIUM) — Expense edit/delete are destructive with no audit trail and ignore linked aggregates
**Epic:** [SPENDLY-2](https://kesavach.atlassian.net/browse/SPENDLY-2) (Spendly Firebase security, realtime and data-integrity remediation)
**Audit:** `docs/SPENDLY_FIREBASE_AUDIT_2026-09-12.md` §E DI-06, §K Phase 5, §M soft-delete rollout
**Baseline:** `main` @ `20b8d41` (2026-09-17) — after SPENDLY-29/30/40/41/45 landed

This is a plan only. Do not treat it as a spec for Ganesh Seva or Nutrition.

---

## 1. Problem (still true on current main)

Create already goes through `services/ledger/createLedgerTransaction.ts`. Edit and delete do not.

| Path | Current behaviour | File |
|---|---|---|
| Expense edit | In-place `updateDoc` of amount/date/category/space | `components/ExpenseForm.tsx` (~409–418) |
| Income edit | Same `updateDoc` bypass | `components/ExpenseForm.tsx` (~446–454) |
| Expense/income delete | Hard `deleteDoc` from the list | `components/ExpenseList.tsx` (~192–231) |
| Trip spend | Stored `trips.spentAmount`, RMW from React state, only on link/unlink | `hooks/useTrips.ts` (~174–229) |
| Split gift expense | `spentExpenseId` is a pointer; list delete does not touch the split | `hooks/useSplits.ts`, `shared/utils/splitLedger.ts` |
| Auto-bill | OPEN auto statements already recompute; PAID ones are skipped | `shared/utils/autoCreditCardBills.ts` `collectAutoCreditCardBillRefreshPatches` |
| Audit tab | Placeholder empty state | `app/(app)/ledger.tsx` (~340–351) |

### Failure scenarios (reconfirm)

1. Edit a trip-linked expense ₹5,000 → ₹500. `trips.spentAmount` stays ₹5,000. `TripDetailModal` / `TripsList` / `isTripOverBudget` / `computeTripSummary` all read the stored counter, not `computeTripSpend`.
2. Delete (or edit) a card expense that fed a **PAID** auto statement. OPEN bills refresh on the next snapshot; PAID/CANCELLED bills are explicitly skipped, so `statementAmount` stays frozen.
3. Delete the gift expense for a spent collect-split. `split.spentExpenseId` dangles. Split UI still thinks the pot is spent.
4. Any edit/delete of historical money is unrecoverable and invisible. The Audit tab copy claims logs exist; nothing writes them.

Income is the same write shape. Include it in this ticket even though the Jira title says “expense”.

---

## 2. Non-goals / sibling tickets

Do **not** expand into:

| Left out | Why | Ticket |
|---|---|---|
| Split delete still `batch.delete`s `accountEntries` + gift expense | Separate destructive cascade | [SPENDLY-39](https://kesavach.atlassian.net/browse/SPENDLY-39) (DI-07) |
| Wizard first expense via `addDoc` | Malformed create, not edit/delete | DI-08 / SPENDLY sibling of KAN-94 |
| Vault expenses (`vaults/{id}/expenses`) | Different rules + `createdBy` model | SPENDLY-31 leftovers |
| Windowing the expenses listener | Cost/perf, not integrity | SPENDLY-12 (RT-02) |
| Rewriting PAID `statementAmount` | Would desync `amountPaid` / status; card position is already derived | see §6.4 |
| Restore-from-audit UX | Nice-to-have leftover | §10 |
| Create-time ledger events | Doubles every SMS/subscription write; not required to close DI-06 | leftover |

Audit rule that still applies: **never delete financial history as a correction.** Correction = soft-delete or compensating record, in one batch, with an event.

---

## 3. Design decisions (lock these before coding)

### 3.1 Soft-delete the live row; do not hard-delete from the journal UI

Match the existing cashback/bill-payment pattern (`AccountPayment.voidedAt` in `services/creditCardBills/billPayment.ts`).

On `users/{uid}/expenses/{id}` and `users/{uid}/incomes/{id}`:

```
deletedAt: string        // ISO, same as payment.voidedAt
deletedBy: string        // uid
deletedReason?: string   // optional, from the confirm sheet
updatedAt: serverTimestamp()
```

The live document keeps amount, date, category, `tripId`, `splitId`, `subscriptionId`, `smsFingerprint`. Lists, balances, insights, auto-bills, and trip spend ignore rows with `deletedAt`.

`firestore.rules` still `allow delete` on expenses/incomes (account-delete guards and SPENDLY-39 still use `deleteDoc`). The **app** stops calling `deleteDoc` from `ExpenseList` / `ExpenseForm`. Do not tighten `allow delete: if false` in this ticket.

### 3.2 Append-only `ledgerEvents`, not nested `expenseRevisions`

Nested `users/{uid}/expenses/{id}/revisions/{rev}` is **denied** today. `match /expenses/{id}` does not recurse, and the personal wildcard (`firestore.rules` ~329–339) only allows a named allowlist that does not include `expenses` subcollections.

Put events at:

```
users/{uid}/ledgerEvents/{eventId}
```

Add an **explicit** rules match (do not dump it into the wildcard):

```
match /ledgerEvents/{id} {
  allow read: if isOwner(uid);
  allow create: if isOwner(uid);
  allow update, delete: if false;   // append-only
}
```

Event shape:

```ts
type LedgerEventAction = "update" | "delete";
type LedgerEventKind = "expense" | "income";

interface LedgerEvent {
  id: string;
  kind: LedgerEventKind;
  docId: string;
  action: LedgerEventAction;
  before: Record<string, unknown>; // snapshot of money fields + links
  after: Record<string, unknown> | null; // null on delete; post-image on update
  actorUid: string;
  reason?: string;
  createdAt: unknown; // serverTimestamp
}
```

`eventId` = Firestore auto-id from `doc(collection(...))` (client-generated, works offline). Do not key events off wall-clock strings; two rapid edits on two devices must not clobber.

Snapshot payload (keep small): `amount`, `category`/`source`, `subcategory`, `date`, `month`, `accountId`, `note`, `tags`, `spaceId`, `tripId`, `splitId`, `subscriptionId`. Drop `createdAt` Timestamp objects from the snapshot if they do not serialize cleanly; store primitives only.

### 3.3 One ledger service, one batch

Extend `services/ledger/` (do not put writes back in the form/list):

| Function | Writes in the same `writeBatch` |
|---|---|
| `updateExpense` | expense `update` + `ledgerEvents` `set` + optional trip `increment` |
| `softDeleteExpense` | expense `deletedAt`… + event + optional trip `increment(-amount)` |
| `updateIncome` | income `update` + event |
| `softDeleteIncome` | income `deletedAt`… + event |

Use `commitWrite(() => batch.commit(), { label })` like SPENDLY-29/30.

Reads needed before the batch:

- Current expense/income (`getDoc`) so `before` is server/cache truth, not the React form state. Refuse if `metadata.fromCache` is true **and** the doc is missing locally? Prefer: if `getDoc` `fromCache` and we lack `tripId`/`splitId`/`amount`, refuse destructive work the same way `deleteAccount` / `deleteTrip` already refuse cache-served cascades. For a normal edit of a row that is already in the listener cache this is fine.
- If `splitId` is set on delete → **refuse** (see §6.3). Do not mutate splits here; that is SPENDLY-39 territory.
- If `tripId` is set → `increment` `trips.spentAmount` by `newAmount - oldAmount` (edit) or `-oldAmount` (delete).

`ExpenseForm` today does **not** send `tripId` on edit, so `updateDoc` already preserves it. The service must keep preserving link fields (`tripId`, `splitId`, `subscriptionId`, `smsFingerprint`, `smsExternalRef`, `vaultId`). Only overwrite the form-owned fields.

### 3.4 Filter live rows in one place, plus defense in depth

`FinanceDataProvider` maps every expense/income snapshot 1:1 today (`providers/FinanceDataProvider.tsx` ~329–360). Change that mapper to **exclude `deletedAt`** from the arrays every consumer already uses (`expenses`, `incomes`).

That automatically fixes:

- Journal History / Income tabs
- Dashboard recent activity
- Insights / analytics
- `computeBankBalance` callers
- Auto-bill draft/refresh (they take `expenses` from the provider)
- `computeTripSpend` if wired to provider expenses

Still add `isActiveLedgerRow(row)` in `shared/utils/` and use it inside:

- `computeBankBalance` / activity builders in `shared/utils/accountBalance.ts`
- `computeTripSpend` / category breakdown
- `previewClosedCycleCreditCardBill` / `collectAutoCreditCardBillRefreshPatches`
- `buildCreditCardLedger` expense fold

Provider-level filter is the product behaviour. Pure helpers must not trust the caller — the audit called this out as the rollout risk (“every list query and derived balance must filter `deletedAt`”).

Do **not** add a Firestore `where("deletedAt", "==", null)` on the live listener. Missing field vs null vs timestamp is messy, needs a new index, and would hide rows from any future restore. Filter in memory. The expenses listener is already unbounded (SPENDLY-12); soft-deleted rows are a small extra.

### 3.5 Trips: derive for display, `increment` for the stored cache

`shared/utils/tripCalculations.ts` already has `computeTripSpend(expenses, tripId)`. UI still uses `trip.spentAmount`.

Do both:

1. **Display / budget checks** take live spend: change `isTripOverBudget` and `computeTripSummary` (or their call sites) to prefer `computeTripSpend(activeExpenses, trip.id)` when expenses are in scope. `TripDetailModal` and `TripsList` already sit under the finance tree — pass expenses in, or select them from context.
2. **Stored `spentAmount`** stays as a denormalized cache so trip docs remain useful if a screen does not have expenses. Maintain it with `increment(delta)` in the same batch as edit/delete **and** change `linkExpenseToTrip` / `unlinkExpense` from React RMW to `increment(±amount)` so two devices cannot clobber.

`tripWellFormed()` already requires `spentAmount >= 0`. An increment that would go negative is denied by rules — clamp in the service (`delta = -Math.min(oldAmount, spentAmount)` is still racy). Safer: `increment(-oldAmount)` and accept that a double-unlink on two devices can fail the second batch; the UI is derived so the user still sees the truth.

### 3.6 Splits: refuse journal delete of a gift expense

If `expense.splitId` is set, `softDeleteExpense` throws a typed error. `ExpenseList` shows: “This expense belongs to a split. Open the split to change it.”

Clearing `spentExpenseId` / un-spending a collect pot / reversing pass-through `accountEntries` belongs in SPENDLY-39, where split delete already batch-touches those docs.

### 3.7 Credit-card `statementAmount`

Current behaviour is already the right product rule:

- **OPEN / PARTIAL auto bills** — `collectAutoCreditCardBillRefreshPatches` recomputes from live expenses and skips `PAID` / `CANCELLED` / manual bills.
- **PAID bills** — `statementAmount` is a frozen snapshot of gross cycle spend. Payments settle statements; they never shrink `statementAmount` (`autoCreditCardBills.ts` comment at the preview helper). `buildCreditCardLedger` derives current card position from expenses + payments.

After soft-delete, OPEN refresh keeps working **if** deleted rows are filtered out of the expenses array (they will be). Do **not** rewrite PAID `statementAmount` in this ticket.

Optional leftover (not required to close DI-06): a discrepancy hint on a PAID bill when live cycle spend ≠ `statementAmount`.

---

## 4. Target write flow

```
ExpenseForm / ExpenseList
        │
        ▼
services/ledger/updateExpense | softDeleteExpense | …
        │
        ├─ getDoc(expense)           // before-image + links
        ├─ guards (auth, amount>0, lockPastMonths, splitId, missing id)
        └─ writeBatch
              ├─ expenses/{id}  update  (fields or deletedAt)
              ├─ ledgerEvents/{newId} set  (before/after/action)
              └─ trips/{tripId}  update  { spentAmount: increment(delta) }  // if tripId
        │
        ▼
commitWrite(batch.commit)
```

Create path stays `createExpense` / `createIncome`. Do not add events on create in this ticket.

`lockPastMonths`: edit already blocks past months in `ExpenseForm`. Apply the same check in `softDeleteExpense` / `softDeleteIncome` so a swipe-delete cannot bypass the setting.

---

## 5. File-level work

### 5.1 New / extend

| File | Change |
|---|---|
| `shared/types/expense.ts` | `deletedAt?`, `deletedBy?`, `deletedReason?` on `Expense` and `Income` |
| `shared/types/ledgerEvent.ts` | New event type |
| `shared/utils/ledgerRow.ts` | `isActiveLedgerRow()`, `ledgerEventSnapshot(row)` |
| `services/ledger/mutateLedgerTransaction.ts` | update + soft-delete (keep create file as-is) |
| `services/ledger/mutateLedgerTransaction.test.ts` | Fake `writeBatch` like `services/creditCardBills/billPayment.test.ts` |
| `shared/utils/tripCalculations.ts` | Overload or new helpers that take expenses; keep stored-counter helpers for cache |
| `firestore.rules` | `match /ledgerEvents/{id}` append-only |
| `firestore/personalData.rules.test.ts` | Owner can create/read event; cannot update/delete; other uid denied |
| `providers/FinanceDataProvider.tsx` | Filter deleted rows in both snapshot mappers |
| `providers/LedgerEventsProvider.tsx` **or** a small hook | `onSnapshot` `ledgerEvents` `orderBy("createdAt", "desc")` — **only mounted on the Audit tab** so we do not add another always-on dashboard listener (RT-01/03) |
| `app/(app)/ledger.tsx` | Replace Audit empty state with the event list |
| `components/ExpenseForm.tsx` | Call `updateExpense` / `updateIncome` |
| `components/ExpenseList.tsx` | Call `softDelete*`; handle split-owned error |
| `hooks/useTrips.ts` | `increment` on link/unlink |
| `components/trips/TripDetailModal.tsx`, `TripsList.tsx` | Display `computeTripSpend` |
| `shared/utils/accountBalance.ts` | Skip deleted rows |
| `shared/utils/autoCreditCardBills.ts` | Skip deleted rows in statement sum |
| `shared/utils/creditCardLedger.ts` | Skip deleted rows |
| `shared/utils/tripCalculations.test.ts` | Deleted expense not counted |
| `shared/utils/accountBalance.test.ts` | Extend the existing “deleted transaction” case to `deletedAt` still-present rows |
| `lib/finance/spaces.integration.test.ts` (and siblings) | One case: soft-deleted expense excluded from `computeBankBalance` |

### 5.2 Do not touch

- `services/ledger/createLedgerTransaction.ts` write shape (SMS + form create)
- `services/subscriptions/duePost.ts`, `services/sms/*` (creates only)
- `hooks/useSplits.ts` delete cascade (SPENDLY-39)
- `hooks/useVaultExpenses.ts`
- Ganesh expense writers
- `SetupWizardModal` create (DI-08)

---

## 6. Behaviour by linked aggregate

### 6.1 Bank / cash balances

Source of truth is already derived (`computeBankBalance`). After the provider + helper filters, a soft-deleted expense drops out of opening+incomes−expenses exactly like today’s hard delete (see `accountBalance.test.ts` “removes a deleted transaction's effect”). No compensating negative row needed.

### 6.2 Trips

| Action | Batch | UI |
|---|---|---|
| Link | `tripId` on expense + `increment(+amount)` | spend = sum of active linked expenses |
| Unlink | `tripId: null` + `increment(-amount)` | same |
| Edit amount | expense update + event + `increment(new−old)` | same |
| Soft-delete | `deletedAt` + event + `increment(-amount)` | same |
| Delete trip | already unlinks expenses in one batch; leave as-is | — |

### 6.3 Splits

Journal delete of `splitId != null` → refuse.

Edit of a split-owned expense: **refuse amount/account/date changes** the same way, or allow note/category-only. Amount edits would desync `spentAmount` on the split and the pass-through entry. Simplest close for DI-06: refuse any update when `splitId` is set, with the same “open the split” copy.

### 6.4 Auto bills

No extra bill writes in the edit/delete batch. The existing refresh loop in `CreditCardBillsProvider` already patches OPEN auto bills when expenses change. After filtering, that loop sees the new gross. PAID statements stay frozen; the card ledger still reflects live spend.

---

## 7. Audit tab UX

Keep the existing sub-tab. Replace the placeholder `EmptyState` with a virtualized list (LegendList/FlashList per repo list rules) of `ledgerEvents`.

Row:

- Action chip: Edited / Deleted
- Kind: Expense / Income
- Title: category or source from `before` (fallback “Transaction”)
- Money: `before.amount` → `after.amount` on edit; `before.amount` on delete
- Timestamp from `createdAt`
- Secondary: account / date if present

Empty: “No edits or deletions yet” + short line that new changes will show here.

Do not invent screenshot amounts. No restore button in v1.

Mount the events listener only while `expensesTab === "audit"` so the dashboard listener budget does not grow.

---

## 8. Firestore rules & indexes

- New `ledgerEvents` match as in §3.2.
- Expenses/incomes: `personalMoneyWellFormed()` only checks `amount` and `date`. Extra `deletedAt` (string) / `deletedBy` / `deletedReason` are allowed. No rules change required for soft-delete fields.
- `deletedAt` as ISO string (not Timestamp) matches `voidedAt` and avoids `optionalYmd` (that helper is YYYY-MM-DD only). Do **not** name the field `date`.
- No new composite index for the Audit query if it is `orderBy("createdAt", "desc")` on the collection (single-field). Add one in `firestore.indexes.json` only if the emulator asks.
- Do not add `ledgerEvents` to the personal wildcard allowlist; an explicit match is clearer and can deny update/delete.

---

## 9. Tests

Mirror the SPENDLY-30 style: mocked Firestore batch in the service test, pure helpers in `shared/utils/*.test.ts`, rules in the emulator suite.

### Service (`mutateLedgerTransaction.test.ts`)

1. Update writes expense + event in **one** `commit`; event `before.amount` / `after.amount` match.
2. Update with `tripId` also `increment`s the trip by the delta.
3. Soft-delete sets `deletedAt` / `deletedBy`, does not `delete()` the expense ref, writes `action: "delete"` with `after: null`.
4. Soft-delete with `tripId` increments by `-amount`.
5. Soft-delete with `splitId` throws; batch not committed.
6. Update with `splitId` throws (if we lock that in §6.3).
7. Missing id / unauthenticated throw.
8. Income update/delete parallel cases (at least one each).
9. Link fields (`tripId`, `smsFingerprint`) are not stripped on update.

### Pure helpers

- `isActiveLedgerRow` false when `deletedAt` is a non-empty string.
- `computeBankBalance` ignores a still-present deleted expense.
- `computeTripSpend` ignores deleted.
- Auto-bill preview amount drops a deleted cycle expense; PAID patch collector still returns no patch for PAID bills.

### Rules

- Owner create `ledgerEvents/e1` succeeds.
- Owner update/delete of that doc fails.
- Other user read/create fails.
- Soft-delete update on `expenses/e1` (`deletedAt` ISO string, amount still ≥ 0) still passes `personalMoneyWellFormed`.

No Maestro/Playwright required to close the ticket; journal + trip + audit are the manual proof.

---

## 10. Leftovers (next tickets, not this PR)

- Restore from Audit (clear `deletedAt`, write `action: "restore"` event, reverse trip increment).
- Create-time events (would cover SMS/subscription posts).
- SPENDLY-39: split delete / mark-collected must soft-delete gift expense + entries instead of `batch.delete`, and must write events.
- PAID statement discrepancy banner.
- `lockPastMonths` currently lives only in the form; moving it into the service is in this ticket, but a shared guard for all money mutations is ARCH-02 / SPENDLY-6.
- `SetupWizardModal` still `addDoc`s a malformed expense (DI-08).

---

## 11. Implementation sequence

Do these as **one PR** unless the rules change needs to land first for emulator CI.

1. Types + `isActiveLedgerRow` + helper tests.
2. `mutateLedgerTransaction` + service tests (no UI yet).
3. Rules + `personalData.rules.test.ts` for `ledgerEvents`.
4. Filter in `FinanceDataProvider` + balance/trip/bill helpers.
5. Wire `ExpenseForm` / `ExpenseList`; trip `increment` + derived spend in trip UI.
6. Audit tab + listener mounted only on that tab.
7. `npm test` for touched files, `npm run test:rules` for the new match, `npm run typecheck`.

Suggested branch when implementing: `cursor/spendly-38-ledger-soft-delete-…` (or `feat/SPENDLY-38-ledger-soft-delete`). Commit/PR title must include `SPENDLY-38`.

---

## 12. Manual testing guide (for the implementation PR)

No commands beyond a running app (`npx expo start` hot-reload is enough once the bundle includes the branch).

1. **Edit, not duplicate** — Edit a normal expense amount. History shows the new amount once. Audit shows one “Edited” row with old → new. Bank balance on Accounts moves by the delta only.
2. **Soft-delete** — Delete that expense. It disappears from History, Insights, and account activity. Firestore still has the document with `deletedAt`. Audit shows “Deleted”. Balance matches a world where the row never happened after delete.
3. **Trip** — Link an expense to a trip, then edit its amount, then delete it. Trip spent figure tracks the live sum (not the original). Unlink still adjusts spend.
4. **Split gift** — Spend a collect pot (creates gift expense). Try to delete/edit it from the journal. App refuses; split still shows spent. (Full reverse is SPENDLY-39.)
5. **OPEN auto bill** — On a card with an OPEN auto statement, add then delete a cycle expense. Statement amount on the OPEN bill follows live spend after refresh. Do not expect a PAID bill’s `statementAmount` to move.
6. **Past-month lock** — Enable “lock past months”. Delete/edit of a previous-month row is blocked the same as today’s edit guard.
7. **Income** — Repeat 1–2 for an income.
8. **Offline-ish** — Trigger an edit; confirm `commitWrite` still toasts the saved/queued copy. Two-device: edit the same row; last write wins on the live doc; **two** audit events exist (append-only).
9. **Expense Tracker / Nutrition** — Unchanged; no shared component restyle. Spot-check that Ganesh funds expense list is untouched.
10. **Audit tab off** — Leave the Audit tab. Confirm we did not add a permanent `ledgerEvents` listener on the dashboard (Flipper/debug listener count, or a `__DEV__` log if one exists).

### Commands the implementer should run

```bash
npx vitest run services/ledger/mutateLedgerTransaction.test.ts shared/utils/accountBalance.test.ts shared/utils/tripCalculations.test.ts shared/utils/autoCreditCardBills.test.ts
npm run test:rules -- firestore/personalData.rules.test.ts
npm run typecheck
```

Full `npm test` before merge.

---

## 13. Risk notes

- **Soft-delete leak:** any new `getDocs(expenses)` (category rename in `useCategories.ts`, space/trip delete, account delete linked-count) will still **see** deleted rows. Account-delete “has linked expenses” must count only active rows, or a user can never delete an account after journal-deleting its history. Call that out in the implementation and filter those queries too (`FinanceDataProvider.deleteAccount`, `useSpaces`, `useTrips.deleteTrip`, `useCategories`).
- **Rules wildcard:** forgetting the `ledgerEvents` match yields permission-denied on every edit. Add the rules test in the same PR as the first write.
- **Listener budget:** an always-on `ledgerEvents` listener from the shell would regress RT-03. Tab-scoped mount is required.
- **PAID bills:** product may *want* statements to move; this plan refuses that. Document it in the implementation PR so it is not “fixed” later by rewriting PAID docs.

---

## 14. Suggested implementation PR title / body sketch

**Title:** `SPENDLY-38: Soft-delete journal edits with ledger events and live trip spend`

**Body:** Link https://kesavach.atlassian.net/browse/SPENDLY-38. Summarise: edit/delete go through `services/ledger`, one batch with `ledgerEvents`, `deletedAt` filtered from balances/lists, trip spend derived + `increment`, split-owned rows refused, Audit tab reads events, PAID statements unchanged.
