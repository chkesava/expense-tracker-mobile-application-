# SPENDLY-525: Due-post moved an already-posted charge to the old account

## Bug
On 2026-10-15 the user had moved the GYM FEE subscription from SBI to HDFC, because SBI was down to ₹912.

| Time | Event |
|---|---|
| Morning | The 15 Oct charge posted on **HDFC**, as expected. |
| 13:13 IST | The same charge doc `{subscriptionId}_2026-10` was written again, this time with `accountId` = **SBI** and a new `createdAt`. |

Neither balance moved:
- **SBI:** the stored balance stayed ₹912, but its ledger now read −₹288, so the running balances looked wrong.
- **HDFC:** the ledger lost the ₹1,200.

## Cause
1. **Planning from a cache-only snapshot.** The subscriptions listener's first snapshot can come from the persisted local cache. On an app that had just been updated, or a browser tab just reopened, that cache predates the account change and still holds the previous `lastProcessed`. `processDueSubscriptions` ran on it, so the already-posted month looked due again and was planned with the old account.
2. **Rewriting an existing charge.** Charge ids are deterministic (SPENDLY-40), so the re-post hit the existing doc. `postDueSubscriptionCharge` then rewrote it with `set(..., {merge: true})` using the stale payload, which moved the charge to SBI. SPENDLY-523 had already stopped the *balance* op on an existing doc, but the doc itself was still rewritten.

## Fix
- **`shared/utils/subscriptionProcessor.ts`:** new `canAutoPostSubscriptions`. Due-posting runs only on a loaded, non-empty and **server-confirmed** (`!metadata.fromCache`) subscriptions snapshot.
- **`providers/ExpenseReferenceDataProvider.tsx`:**
  - The subscriptions listener now uses `includeMetadataChanges` and tracks `fromCache`, so the cache → server transition is seen even when the data is unchanged. These metadata-only events cost no reads and skip the list re-render.
  - The auto-post effect is gated on `canAutoPostSubscriptions`.
- **`services/subscriptions/duePost.ts`:** when the charge doc already exists (`docAlreadyWritten`), the charge is **not written at all**. Only the subscription's `lastProcessed` / `lastProcessedDate` / completion stamp is written, and the result is `already_posted`. Once posted, a charge can only change through the user's own edit, which moves balances correctly.

### Behaviour change
Offline, auto-posting now waits until the app is next online with a server-confirmed snapshot. Before, a cache-only snapshot could post offline. This is deliberate: an offline post from stale data is exactly what moved this charge.

## Data repair
The user runs this, because writing to production from the agent was blocked:
1. `scripts/.move-gym-charge-to-hdfc.tmp.ts` (dry-run, then `--apply`) sets only `accountId` back to HDFC on `expenses/8DdwU0B1jGNQpxIvPvn7_2026-10`. It refuses unless the doc is exactly the ₹1,200 SBI charge of 2026-10-15. The file is untracked and is deleted after use.
2. Rebuild HDFC only (dry-run, then apply). Expected result: ₹29,438.50 → ₹28,238.50.
3. Run an SBI rebuild dry-run and expect no variance: the ledger is back to ₹912, equal to the stored value.

**Do not fix it with an in-app edit.** `updateExpense` would credit SBI ₹1,200 that it was never debited.

## Tests
- `shared/utils/subscriptionProcessor.test.ts`: the gate. It allows a loaded, server-confirmed, non-empty snapshot and refuses one that is cache-only, still loading or empty.
- `services/subscriptions/duePost.test.ts`:
  - An existing charge is never rewritten, even from a stale payload with a different account (the GYM FEE case). The subscription is still stamped, and the result is `already_posted`.
  - The same holds for an existing recurring transfer.
