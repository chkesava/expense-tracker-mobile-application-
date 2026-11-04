# SPENDLY-596 — the Journal's live window on the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-596-journal-live` |
| Migration | none |

## What changed

`FinanceDataProvider`'s newest-300 listeners for **`expenses`** and **`incomes`** go through the read switch (673): `readModel.expenses` and `readModel.incomes` = `firestore` (default) | `shadow` | `supabase`.

- **`firestore`:** unchanged.
- **`shadow`:** Firestore serves. Each window snapshot is compared with the on-device copy, **window only**: older rows the window can't see aren't "extra". Counts only are logged (`readModel.shadow.expenses` / `incomes`).
- **`supabase`:** the listeners aren't mounted. The copy serves the window: newest first by `createdAt`, 300 rows, the same order and limit as the listener. The rows go through **the same code as before**:
  - the ledger fold, which drops soft-deleted rows;
  - the "pushed out of the window" preservation;
  - the staged-page completeness check.

  The apply functions take a `fromCopy` flag: no Firestore read logging or push notification, no Firestore cursor taken from a copy row, no "server sync" timestamp. "Waiting to sync" counts this device's **unsent outbox writes** for the table.
- **Load more in `supabase` mode:** older rows come from the copy by position after the window, with deleted rows counted as the window's limit counts them. They're folded active-only, and repeats are dropped with the existing `unseenRows`. The Firestore cursor path is untouched in the other modes.
- **A session fallback** (a copy error) re-runs the effect with the Firestore listener, because the modes are in its deps.

**Consumers (588's F6):** Dashboard, Journal, Insights, forms, Runway, Calendar, recurring sync and SetupProgress all read `FinanceDataProvider`'s state, so they follow the switch with no change. Recurring sync only writes **local** review suggestions (`recurringStore`), not financial data, so R4.3a allows the switch.

**`ledgerEvents`:** its audit list (`useLedgerEvents`) already reads the read model through the `audit` screen switch (SPENDLY-511/513), online. Moving it onto the on-device copy can come with 600, if it's needed for the read savings.

**The pieces:** `lib/readModelLocal/ledgerWindow.ts`, which holds the window spec, `copySnapshot`, `copyPendingCount` and `loadOlderFromCopy`. `readSource` gains sort keys (`by`, for Timestamps), `offset`, and windowed shadow.

## Tests

- **`ledgerWindow.test.ts`:**
  - the window is the newest 300 by `createdAt` (Timestamps);
  - copy rows through the real fold: soft-deleted rows drop out, nothing pending;
  - a short window is complete, a full one is not;
  - older pages by position until exhausted;
  - the pending count per table.
- **`providerSwitch.test.ts`:** `expenses` and `incomes` are now integrated, under the same guard: the listener is kept, the copy is read only in `supabase` mode, shadow compares only in `shadow` mode, and the modes are in the effect deps.

## Results

- `npm test`: 536 files, 7,600 tests. `npm run test:rules`: 31 files, 622 tests.
- `tsc` and `typecheck:shared` pass.

## Acceptance (after the epic reaches main)

1. `readModel.localCopy` and `readModel.realtime` on.
2. `readModel.expenses` and `readModel.incomes` set to `shadow`, then **7 days with no `readModel.shadow.expenses`/`incomes` logs**.
3. Then set them to `supabase` (the user approves):
   - a new save shows at once (the outbox overlay) and on other devices within 10 s (realtime);
   - the offline drill passes;
   - the read delta is measured with the 588 meter. The window's listeners are off only when **all** consumers read through the provider, which they do.
