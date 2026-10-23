# SPENDLY-571: stamp `updatedAt` so the 3-hourly sync can see changes

[SPENDLY-571](https://kesavach.atlassian.net/browse/SPENDLY-571) is part of the SPENDLY-494 epic and blocks SPENDLY-506.

- Branch: `feature/SPENDLY-571-stamp-updatedat`, cut from the epic branch after SPENDLY-505 was merged.

## Why

The sync runs every 3 hours and copies only what changed (ADR §0, decision 6). It finds those documents with `createdAt > hw` or `updatedAt > hw`.

The read-only production check on 2026-10-22 found almost no `updatedAt`: `expenses` 9/1,369, `categories` 0/2,093. The code audit found many updates that stamp nothing. Those edits would be invisible to the incremental run until the nightly full copy.

## What changed

Only an extra `updatedAt: serverTimestamp()` field on the writes listed below. No amounts, balances, dashboard ops or other logic changed.

| File | Writes now stamped |
|---|---|
| `hooks/useCategories.ts` | Category: patch (hidden, favorite, style), update, rename, archive, merge reparent. Expense: rename relabels (category and subcategory) and merge relabels |
| `hooks/useSplits.ts` | Split delete's soft delete of the linked expenses |
| `hooks/useSpaces.ts` | Space delete (unlink) and assigning expenses to a space |
| `hooks/useTrips.ts` | Trip delete (unlink), link and unlink of an expense |
| `lib/ensureCategoryHierarchy.ts` | Default-taxonomy update, archive, custom-sub reparent, and the expense V4 remap |
| `services/creditCardBills/billPayment.ts` | `recordCreditBillPayment` now sets `updatedAt` on create (see below) |
| `scripts/reconcile-credit-card-bill-payments.js` | Status fix, duplicate merge and cancel (admin script) |

**Why `recordCreditBillPayment` stamps on create:**
- `editCreditBillPayment` refuses an edit when the stored `updatedAt` differs from the one the form opened with.
- A freshly recorded payment had no `updatedAt`, so that check compared `undefined` with `undefined`. It could never catch an edit from another device.
- With the stamp, the check works from the first edit.

**Firestore rules:** checked, no change needed.
- `expenses` validates `amount` and `date` only (`personalMoneyWellFormed`).
- `categories` is in the owner catch-all.
- `creditCardBills` and `accountPayments` already accept `updatedAt`.

**Not stamped, on purpose:**
- `accounts`, `accountTypes`, `accountTransfers` and `accountEntries`: SPENDLY-506 copies them in full every run.
- Writes to collections that aren't synced: budgets, categorisation rules, subscriptions, trips, splits, payment requests and settings.

## Guard test: `scripts/syncStampGuard.test.ts`

It statically scans every Firestore write in `app`, `components`, `hooks`, `lib`, `providers`, `services`, `shared`, `features`, `netlify` and `scripts`. That covers `updateDoc`, `setDoc`, `addDoc`, `batch`/`tx`/`writer` `.update` and `.set`, and `commitMutations` `op: "update" | "set"` objects. The rules it enforces:

1. **Updates and merge-sets** on a changed-only collection (expenses, incomes, accountPayments, creditCardBills, categories, ledgerEvents) must set `updatedAt`.
2. **Creates** there must set `createdAt` (or `updatedAt`).
3. **Writes through a ref variable** in a file that writes changed-only collections must set `updatedAt` or appear in `ALLOWED` with a reason. Seven are allowed today, all on other collections or inside `createBatchWriter`, whose call sites are checked.
4. **No stale exemptions:** every `ALLOWED` entry must still match a real call.

**How it identifies the collection:** a literal counts as a collection only when a document id follows it, or inside `collection(...)`. So `doc(…, "meta", "categories")` isn't mistaken for the categories collection.

**Self-tests:** the guard proves it finds sites (more than 5 expense writes and more than 3 category writes), and includes regression fixtures for an unstamped update, an unstamped create, a commitMutations op and a ref-variable write.

**Mutation check:** I removed a trip-unlink stamp and several category stamps from the real files; the guard reported each one. The files were restored, and the diff is unchanged.

## Tests

Results (2026-10-22):
- `scripts/syncStampGuard.test.ts` (6): passes.
- `services/creditCardBills/billPayment.test.ts` (+1): the new payment carries `createdAt` and `updatedAt` as server timestamps. 35 tests pass.
- `npm test`: 401 files, 5,825 tests, all passing.
- `typecheck:shared` passes.
- Full `tsc` passes.

**Not run:** device QA. Rename, merge and archive a category; delete a split; link and unlink a trip or space; record a bill payment. Then confirm the documents carry `updatedAt` in the emulator. The hooks are outside the vitest include, so they rely on the guard.

## Rollout

- **No data migration:** documents written before this have no `updatedAt`. 506's first full copy covers them.
- **Older app versions** keep writing without the stamp until users update. Those edits reach Supabase at the next nightly full copy, at most 24 hours later.
