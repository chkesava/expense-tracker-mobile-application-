# SPENDLY-119: Investments & Portfolio Management (Epic)

## State

**Epic in progress** — first story underway on `feature/SPENDLY-119-investments-portfolio-management`.

- **SPENDLY-419**: In Progress — Portfolio recalibration & historical transaction reconciliation (`feature/SPENDLY-419-portfolio-recalibration`).
- **SPENDLY-420**: To Do — Separate Stock Profile from Holding and persist every BUY transaction. Larger restructuring of the holdings data model; out of scope for SPENDLY-419, which stays inside the current `Holding`/`PortfolioTransaction` shape.

## Related, already-merged work under this epic (pre-dates this tracker)

- **SPENDLY-388** (`docs/SPENDLY-388-portfolio-home.md`) — Portfolio home dashboard; confirms SPENDLY-119 as the parent epic for holdings/cash-ledger/XIRR work.
- **SPENDLY-46** / commit `5705ba7` (KAN-77) — Adding a holding did not deduct the Investment Cash Balance. Fixed by adding a cash ledger PURCHASE entry in `createHoldingWithCash`, but that fix never added the matching `portfolioTransactions` BUY row — the gap SPENDLY-419 closes.

## Decisions

- SPENDLY-419 fixes the root cause (every funded holding now atomically gets a BUY transaction row) and adds a previewable, idempotent recalibration flow for historical data — it does not touch the Holding/Stock Profile data model shape (that's SPENDLY-420).
- Recalibration only ever auto-repairs the unambiguous case (a cash PURCHASE entry exists but its transaction row is missing). Any cash-side gap or ambiguity is routed to explicit user confirmation — never fabricated.
