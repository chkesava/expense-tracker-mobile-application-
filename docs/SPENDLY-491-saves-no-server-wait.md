# SPENDLY-491: Saves read account info from the cache, not the server

**Epic:** SPENDLY-488 (Android lag fixes).

## Problem
Every save awaited `getDoc(users/{uid}/accounts/{id})` before `commitMutations`, to learn the account's credit flag, balance and `balanceInitialized`.
- **Create** (expense or income): `createLedgerTransaction.ts`, both paths.
- **Edit, delete and restore:** `mutateLedgerTransaction.ts` via `fetchAccountTypes`, which read accounts **one after another**.
- **Other paths:** cashback, entries, transfers, bill payments and splits, all through `fetchAccountTypes`.

`getDoc` goes to the server whenever the device is online. On a weak network the sheet stayed open for a full round trip, or until Firestore gave up and marked itself offline.

## Fix
- **`readAccountSnap()`** in `services/ledger/fetchAccountTypes.ts` reads `getDocFromCache` first.
  - The accounts collection has a live listener for the whole session, so the local cache holds every account at its latest known state, including this device's pending writes.
  - It falls back to `getDoc` only for an account the cache has never seen.
- **`fetchAccountTypes()`** now reads all its accounts **in parallel**. The doc-to-`AccountInfo` mapping moved into `accountInfoFromSnap()` unchanged, including SPENDLY-436's "never seeded" handling.
- **`createLedgerTransaction`:** both inline reads now use `fetchAccountTypes`, which has the identical mapping and is no longer duplicated.
- **`billPayment`:** the "does the paying account still exist" check also uses `readAccountSnap`.

## Deliberately not changed
The provider's `getDoc` of the **row itself** in cashback, void, delete entry and delete transfer stays a server read. Those reads are idempotency guards: a retried cashback, or a second device, must not apply a balance delta twice.

## Tests
- `fetchAccountTypes.test.ts` has two new tests: a cache hit makes no server read and uses this device's pending state, and only a cache miss falls back to the server, with ids deduped.
- `mutateLedgerTransaction.test.ts` and `billPayment.test.ts` mock `getDocFromCache`.
- `npm test`: 352 test files pass (5,372 tests).
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared`: clean.
