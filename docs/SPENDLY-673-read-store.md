# SPENDLY-673 — the read store and per-collection provider switch

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2), N5 |
| Branch | `feature/SPENDLY-673-read-store` |
| Migration | none |

## The switch

Each collection has a switch: `system_settings/global.readModel.<collection>` (`shared/utils/readModel/collectionMode.ts`).

| Mode | What it does |
|---|---|
| `firestore` (default; anything missing or unknown) | Today's listener, unchanged |
| `shadow` | Firestore serves the screen. Each snapshot is compared with the on-device copy, and differences are logged as **counts and column names only** (`readModel.shadow.<collection>`, at most once per 10 min, only when they differ) |
| `supabase` | The on-device copy (594) serves the screen, and the Firestore listener isn't mounted (600 measures that). Any failure falls back to Firestore for the rest of the session (`readModel.fallback.<collection>`) |

**Always `firestore`, whatever is configured:**
- in duress, in Spendly Test, or signed out;
- in a build without the read model;
- with `readModel.localCopy` off;
- after a session fallback.

`supabase` also **waits for the copy to be ready** (hydrated), so a screen never goes blank while it fills. `userSettings` has no switch: its copy holds allowlisted fields only.

## The pieces

- **`lib/readModelLocal/readSource.ts`:**
  - the read store (`queryCopy`: filter, order and limit on the device; `subscribe`: re-reads when the copy says the table changed);
  - the shadow comparison runner.

  Documents come as `{ id, data }`, the same as Firestore's (`fromReadModelDoc` restores timestamps; a nested row's id is its own), so each provider's existing mapping runs unchanged. This device's unsent writes are already overlaid by the copy.
- **`shared/utils/readModel/shadowCompare.ts`:** Firestore's documents go through the shared mapper and are compared on the typed columns, as the nightly parity does (`typedDifferences`).
- **`hooks/useReadModelSource.ts`:** the provider-facing hook. It returns the effective `mode`, `subscribe` and `shadow`, follows the copy's state (`localCopy.onState`), and records a session fallback (the provider's effect re-runs on the mode change).

## Wired in this story

These are plain listeners, with no write driven by their data:

| Provider / hook | Collections |
|---|---|
| `CreditCardBillsProvider` | `creditCardBills` |
| `BorrowingsReceivablesProvider` | `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments` (ordering kept: `borrowedDate`, `lentDate`, `date` desc) |
| `ExpenseReferenceDataProvider` | `categoryBudgets` (`month` desc) |
| `useInvestments` | `investments` (`startDate` desc) |

**The pattern:** the existing mapping moves into `apply(docs)`. In `supabase` mode the effect subscribes to the copy; otherwise it runs the unchanged `onSnapshot`, which in `shadow` mode also compares. The mode is in the effect's deps.

## Not wired yet, deliberately (a deviation from the ticket's "every provider")

The ticket asked for every provider. These keep reading Firestore, each for a reason that its own story settles. `lib/readModelLocal/providerSwitch.test.ts` refuses a switch on any of them.

| Collections | Why not yet | Where |
|---|---|---|
| `subscriptions` | They drive due-subscription **auto-posting**, which waits for server-confirmed data (SPENDLY-525). A stale copy could post twice | 598 |
| `sipPlans`, `sipTransactions`, `virtualPositions` | **SIP execution** writes from them | 598 |
| EPF collections | The **EPF summary sync** writes the stored summary from them | 598 |
| `financialSummaries` | The EPF summary sync compares against it; dashboard tiles | 599 |
| `expenses`, `incomes` | The windowed Journal: paging, live window, shadow history (SPENDLY-511/512) | 596 |
| `accounts`, `accountTypes`, `accountEntries`, `accountPayments`, `accountTransfers` | Balances, the ledger fold, pending-sync counts (from Firestore's pending-write metadata) and hydration guards | 597 |
| `financialGoals` | Per-goal pending-write state (SPENDLY-613) | 599 |
| `categories` | Loaded by revision (SPENDLY-660), not a plain listener | 674 |

**The rule** (now in READ_MODEL_RULES R4.3a): a collection whose data drives a write stays on Firestore until that writer reads Firestore directly.

## Tests

- **`collectionMode.test.ts`:**
  - only `supabase`/`shadow` when everything allows it;
  - firestore by default, for unknown values, `userSettings` and unsynced collections;
  - firestore in duress, test mode, signed out, unconfigured, copy off, and after a fallback;
  - `supabase` waits for a ready copy, while `shadow` doesn't.
- **Shadow comparison:** clean when equal; it counts missing, extra and differing with column names, and never includes values or ids.
- **`readSource.test.ts`:**
  - documents shaped as Firestore's (timestamps restored, nested ids);
  - filter, order and limit;
  - subscribe re-reads only on its table's change, and stops after unsubscribe;
  - failures (no copy, a read error) reach `onError`;
  - shadow logs counts once per window, and nothing when clean or before the copy is ready.
- **`providerSwitch.test.ts`** (source guard):
  - the integrated set is exact;
  - no not-yet collection is wired;
  - each use keeps `onSnapshot` (the firestore default is pinned), subscribes only under `mode === "supabase"`, shadows only under `mode === "shadow"`, and has the mode in its effect deps.
- **The outage drill per collection:** a copy failure reaches `onError` and falls back (`readSource.test.ts`); the hook's fallback is per collection and per session.

## Results

- `npm test`: 535 files, 7,593 tests. `npm run test:rules`: 31 files, 622 tests.
- `tsc` and `typecheck:shared` pass.

## After the epic reaches main

Per collection: set `readModel.<collection> = shadow` and watch `readModel.shadow.<collection>` (none means equal). Then `supabase`, after the shadow period: 7 days, or 14 where money is shown, and the user's approval. That needs `readModel.localCopy` on (594).

> **Correction (SPENDLY-597):** `creditCardBills` (and 596's `expenses`) also feed the credit card bill pass, which writes statements. That was missed here. 597 makes the pass verify on Firestore before writing (R4.3a).
