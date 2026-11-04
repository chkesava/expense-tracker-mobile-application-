# SPENDLY-597 — accounts, the account ledger and bills on the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-597-accounts-ledger` |
| Migration | none |

## What changed

### Account collections through the read switch (673)

`FinanceDataProvider`'s listeners for **`accounts`, `accountTypes`, `accountPayments`, `accountEntries` and `accountTransfers`** now follow `readModel.<collection>`: `firestore` (default), `shadow`, `supabase`. (`creditCardBills` was wired in 673, `expenses`/`incomes` in 596.)

- **`supabase`:** the on-device copy serves.
  - Accounts and types use the same mapping as before.
  - The ledger rows go through the same `foldLedgerSnapshot` and date sort.
  - Waiting-to-sync counts this device's unsent outbox writes per table; there is no Firestore pending-write metadata in this mode.
- **`shadow`:** each Firestore snapshot is compared with the copy (counts only).
- **Fallback:** the modes are in both effects' deps, so a session fallback re-mounts Firestore.
- **Balances and card dues shown are the stored copies** (`currentBalance`/`currentOutstanding`, 592).
- **The SPENDLY-675 cycle numbers** (`useCreditCardLiveUsage`: unbilled spend, statement due, cashback, available credit) are derived in TypeScript from these same rows. So in `supabase` mode the same helpers run over the copy's rows, with no SQL. Shadow compares the rows they're derived from.

### Writers never write from the copy (READ_MODEL_RULES R4.3a; the user's decision, 2026-11-04: "read Firestore for the write")

**What 597 found:** the credit card **bill pass** writes statements from the providers' data. It creates them, refreshes them, allocates payments (`amountPaid`) and merges duplicates, reading accounts, types, expenses, payments and bills. Its compare-and-set covers only the bill doc. **673 (`creditCardBills`) and 596 (`expenses`) had already wired two of its inputs**, a gap in their R4.3a review. It's harmless so far, because every switch is `firestore` and nothing has shipped. 597 closes it.

- **The bill pass** (`CreditCardBillsProvider.generateAutoBills`, `lib/readModelLocal/billPass.ts`):
  - **All inputs on `firestore` or `shadow`:** unchanged.
  - **Any input on `supabase`** (bills, expenses, payments, accounts, types; `useReadModelMode`):
    1. `billPassHasWork` runs the pass's own pure calculations on the screen's data, with the provider's `refreshDerivedFields`. **Usually there's nothing to do: no Firestore reads.**
    2. Otherwise `loadAuthoritativeBillInputs` reads Firestore: bills, accounts, types, payments, and **each credit card's expenses** (equality on `accountId`, so no new index). Reads are metered with `logDirectRead`.
    3. The unchanged pass runs on those inputs, with its compare-and-set.

  The pass still runs only on first load and app focus (SPENDLY-45).
- **The bill mapping** (`toCreditCardBill`) is now shared by the listener, the copy and the Firestore loader.
- **The account baseline repair** (`FinanceDataProvider`, which clears an accidental `balanceAsOfDate`): when accounts come from the copy, it confirms the baseline on Firestore first (one read, and only for a candidate account).

Other consumers checked:
- **Recurring detection** writes local suggestions only (596).
- **Bill payments, transfers and edits** are user actions on what the user sees, as today; their writes go through `commitMutations` or the 671 hooks.

## Tests

- **`billPass.test.ts`:**
  - the shared bill mapping (numbers, remaining, recomputed status, CANCELLED kept);
  - no work means no reads;
  - a duplicate statement is work;
  - the Firestore loader queries only credit cards' expenses, keeps active rows only, sorts payments newest first, and maps bills as the listener does;
  - the copy is involved only in `supabase` mode.
- **`providerSwitch.test.ts`:**
  - the five account collections are integrated, under the same guard (listener kept, copy only in `supabase`, shadow only in `shadow`, modes in deps);
  - **the bill pass checks its inputs' modes and loads from Firestore**;
  - **the baseline repair confirms on Firestore** in copy mode.

## Results

- `npm test`: 537 files, 7,612 tests. `npm run test:rules`: 31 files, 622 tests.
- `tsc` and `typecheck:shared` pass.

## Acceptance (after the epic reaches main)

- **The Free plan (595):** health's capacity checks green before any of these is set to `supabase`.
- Shadow: **14 days with zero differences, balances to the paisa**, including the cycle numbers (they follow from the rows).
- The own-write overlay and realtime, including **a bill created on another device triggering the pass**: the bill reaches the copy through realtime, and the pass runs on focus, verifying on Firestore.
- Fallback and offline drills; the read delta (588 meter). Expect a few Firestore reads per focus when the pass has work.
