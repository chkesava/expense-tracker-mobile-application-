# SPENDLY-671 — every direct writer tells the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-671-route-direct-writers` |
| Depends on | SPENDLY-670 (the client write outbox) |

## The hooks (`lib/readModelWriteHooks.ts`)

- **`noteDirectWrites(uid, paths)`**: tells the server push (SPENDLY-583) and the client write outbox (SPENDLY-670) which documents were written. It is called after the write call or `commitWrite` returns, exactly where `commitMutations` calls them. `commitWrite` returns within 1.5 s even offline (`queued`), and the write is already in the local cache by then.
- **`noteTransactionWrites(uid, paths)`**: for transactions. **The push only.** A transaction isn't applied to the local cache until the server commits it, so the outbox could read a stale copy; the push reads the committed version from Firestore.
- **`trackedBatch(writeBatch(db))`**: a batch that remembers every document it sets, updates or deletes, including what `stageMutationOps` adds (balances, dashboard summaries). The writer calls `noteDirectWrites(uid, batch.writtenPaths())` after committing.

Paths outside synced collections are ignored, so writers pass everything they wrote.

## Writers routed (synced collections: the 12 in `mapping.ts`)

| Writer | Collections | Change |
|---|---|---|
| `providers/CreditCardBillsProvider.tsx` | `creditCardBills` | `noteDirectWrites` after each of the 7 `commitWrite` bill writes. The SPENDLY-497/675 allocation **transaction** → `noteTransactionWrites` when it applied |
| `hooks/useSplits.ts` | `expenses`, `accountEntries`, balances and summaries via `stageMutationOps` | 14 batches → `trackedBatch` + `noteDirectWrites` |
| `hooks/useTrips.ts`, `hooks/useSpaces.ts` | `expenses` (trip and space links) | 3 + 3 batches |
| `hooks/useCategories.ts` | `expenses` (rename and merge relabels) + dashboard keys; `categories` | the per-chunk batches; the category writes through `noteCategoriesWritten`, which now uses `noteDirectWrites` |
| `services/portfolio/investmentCash.ts` | `accountEntries` (the bank leg) + balances | 8 batches |
| `services/ledger/rebuildFinancialSummaries.ts` | `accounts` (the manual rebuild) | 1 batch |
| `services/creditCardBills/autoBill.ts` | `creditCardBills` | already `commitMutations`; no change |
| `lib/ensureCategoryHierarchy.ts` | `categories`, `expenses` | **allowed exception:** a rare bulk taxonomy migration (hundreds of documents). Its stamp already asks the push for a user sync (`notifyReadModelChanged`) |

**Not synced yet, so not routed here.** These come in when their collections join the mapping (589–591), and the guard then enforces them automatically:
- receivables and borrowings (`BorrowingsReceivablesProvider`, including the SPENDLY-668 lend);
- EPF, SIP, portfolio and trips documents;
- the theme fields on `users/{uid}` (SPENDLY-677 `ThemeProvider`).

## The guard

`lib/readModelWriteHooks.test.ts` scans `app`, `components`, `hooks`, `lib`, `providers`, `services` and `shared` (not tests, Ganesh or Nutrition). A file that writes a synced collection directly must call `noteDirectWrites`, `noteTransactionWrites`, `noteCategoriesWritten` or `commitMutations`, or be listed as an exception with a reason.

**What counts as a write:**
- `setDoc`/`updateDoc`/`deleteDoc`/`addDoc`, or a batch's `.set`/`.update`/`.delete`, on `doc(…, "users", uid, "<synced>"…)`;
- the same call through a ref variable bound to such a path.

The synced list comes from `READ_MODEL_TABLES`, so new collections are covered as they land. The test also asserts it still finds the known writers, so it isn't passing vacuously.

**Mutation-checked:** removing the hooks from `hooks/useTrips.ts` made the guard fail, naming that file.

**Limitation:** the check is per file. One hook in a file passes it, even if another write in the same file is missed. Reviews catch that.

## Tests

- `lib/readModelWriteHooks.test.ts`: the hooks (push plus outbox; transaction push only; no-ops), `trackedBatch` (forwards every call and records each path once), and the guard.
- `lib/categoryRevision.test.ts`: still green, with categories now through `noteDirectWrites`.
- `npm test` (524 files), `npm run typecheck:shared` and `tsc`: pass.

**Not run:** the lab check that the outbox entry count equals the Firestore write count over a session touching every writer. It needs every writer driven in the app on Spendly Test. Do it with the epic's device QA.
