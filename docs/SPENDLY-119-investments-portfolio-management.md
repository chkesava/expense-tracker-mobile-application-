# SPENDLY-119: Investments & Portfolio Management (Epic)

## State

**Epic in progress** on `feature/SPENDLY-119-investments-portfolio-management`.

- **SPENDLY-419**: Merged into the epic branch (not yet on `main`) — Portfolio recalibration & historical transaction reconciliation. Production backfill script not yet run.
- **SPENDLY-420**: In Progress (`feature/SPENDLY-420-stock-profile-split`) — Separate Stock Profile from Holding and persist every BUY transaction. Production migration script not yet run.

## Related, already-merged work under this epic (pre-dates this tracker)

- **SPENDLY-388** (`docs/SPENDLY-388-portfolio-home.md`) — Portfolio home dashboard; confirms SPENDLY-119 as the parent epic for holdings/cash-ledger/XIRR work.
- **SPENDLY-46** / commit `5705ba7` (KAN-77) — Adding a holding did not deduct the Investment Cash Balance. Fixed by adding a cash ledger PURCHASE entry in `createHoldingWithCash`, but that fix never added the matching `portfolioTransactions` BUY row — the gap SPENDLY-419 closes.

## Decisions

- SPENDLY-419 fixes the root cause (every funded holding now atomically gets a BUY transaction row) and adds a previewable, idempotent recalibration flow for historical data — it does not touch the Holding/Stock Profile data model shape (that's SPENDLY-420).
- Recalibration only ever auto-repairs the unambiguous case (a cash PURCHASE entry exists but its transaction row is missing). Any cash-side gap or ambiguity is routed to explicit user confirmation — never fabricated.
- SPENDLY-420 adds a `stockProfiles` collection as the authoritative, reusable instrument identity (what "select/create"/"reuse" resolve against) but deliberately keeps `Holding`'s existing denormalized identity fields rather than stripping them — this avoids any UI component changes and matches how `portfolioTransactions`/`investmentCashTransactions` already denormalize `symbol`. "Adding the same stock again" now routes into a subsequent-buy path (updates the existing holding, appends a transaction) instead of creating a duplicate holding.
