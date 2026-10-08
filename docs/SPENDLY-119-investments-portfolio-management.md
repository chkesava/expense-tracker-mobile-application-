# SPENDLY-119: Investments & Portfolio Management (Epic)

## State

**Epic complete, merging to `main`.**

- **SPENDLY-419**: Merged into the epic branch — Portfolio recalibration & historical transaction reconciliation. Production backfill script (`scripts/reconcile-portfolio-holdings.js`) not yet run.
- **SPENDLY-420**: Merged into the epic branch — Separate Stock Profile from Holding and persist every BUY transaction. Production migration script (`scripts/backfill-stock-profiles.js`) not yet run.

**Deploy dependency**: both stories add a new Firestore collection (`portfolioReconciliationAudits`, `stockProfiles`) with its own rule block. `holdings`/`portfolioTransactions` writes now include a `stockProfiles` write in the same batch (`createHoldingWithCash`, `executeMockBuy`/`Sell`, CSV import) — under the currently-live production rules (which don't yet have the `stockProfiles` match block), that write is denied, which fails the **entire batch** atomically. Per `docs/AFTER_MERGE_CHECKLIST.md`'s "ticket only adds a client write" case: **Firestore rules must be deployed before or together with this app release**, not after, or every Add Holding / Buy on the new app build breaks until rules catch up.

## Related, already-merged work under this epic (pre-dates this tracker)

- **SPENDLY-388** (`docs/SPENDLY-388-portfolio-home.md`) — Portfolio home dashboard; confirms SPENDLY-119 as the parent epic for holdings/cash-ledger/XIRR work.
- **SPENDLY-46** / commit `5705ba7` (KAN-77) — Adding a holding did not deduct the Investment Cash Balance. Fixed by adding a cash ledger PURCHASE entry in `createHoldingWithCash`, but that fix never added the matching `portfolioTransactions` BUY row — the gap SPENDLY-419 closes.

## Decisions

- SPENDLY-419 fixes the root cause (every funded holding now atomically gets a BUY transaction row) and adds a previewable, idempotent recalibration flow for historical data — it does not touch the Holding/Stock Profile data model shape (that's SPENDLY-420).
- Recalibration only ever auto-repairs the unambiguous case (a cash PURCHASE entry exists but its transaction row is missing). Any cash-side gap or ambiguity is routed to explicit user confirmation — never fabricated.
- SPENDLY-420 adds a `stockProfiles` collection as the authoritative, reusable instrument identity (what "select/create"/"reuse" resolve against) but deliberately keeps `Holding`'s existing denormalized identity fields rather than stripping them — this avoids any UI component changes and matches how `portfolioTransactions`/`investmentCashTransactions` already denormalize `symbol`. "Adding the same stock again" now routes into a subsequent-buy path (updates the existing holding, appends a transaction) instead of creating a duplicate holding.
