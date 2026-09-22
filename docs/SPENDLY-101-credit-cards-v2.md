# SPENDLY-101 Credit Cards V2 — Agent Guide

Epic: [SPENDLY-101](https://kesavach.atlassian.net/browse/SPENDLY-101) — Credit Card Intelligence & Lifecycle  
Integration branch: `credit-cards-v2`

## Start gate (mandatory)

Do **not** create the integration branch, ticket branches, or implementation PRs until:

1. The epic `SPENDLY-101` status is **In Progress**, **or**
2. The user explicitly says to start SPENDLY-101 / credit-cards-v2

If the epic is still **To Do**, only answer questions or refine the plan. Do not code.

## Integration workflow

Same strategy as Accounts V2 (`accounts-v2` / SPENDLY-78):

1. When the epic is started, create `credit-cards-v2` from the latest `main` if it does not exist yet.
2. For every remaining ticket: pull latest `credit-cards-v2`, branch from it (`feat/SPENDLY-XXX-short-slug`).
3. Open each ticket PR against `credit-cards-v2`.
4. Merge into `credit-cards-v2` after checks pass.
5. Do **not** merge `credit-cards-v2` → `main` until every epic ticket is complete and the user explicitly requests the final merge.
6. Keep tickets out of **Done** while changes exist only on `credit-cards-v2`.

## Architecture rules

- Reuse existing credit-card account, expense, payment, cashback, and bill models.
- Do not create a parallel transaction ledger.
- Preserve liability vs unbilled vs billed vs payments vs cashback.
- One authoritative calculation path + regression tests for derived amounts.
- Keep automatic-statement completeness and settled-statement correction rules intact.
- Multi-record financial writes must be atomic/idempotent where applicable.

## Required ticket order

Unless the user explicitly changes it:

### 0. Correctness foundation (already done)

- SPENDLY-95 Cashback exclusion during bill generation (**Done**)
- SPENDLY-97 Auto bills from truncated staged ledger (**Done**)
- SPENDLY-99 User-confirmed recalculate for settled auto bills (**Done**)

### 1. Discovery and card health

- SPENDLY-100 Read-only settled-statement discrepancy report
- SPENDLY-103 Credit card financial health and utilization workspace

### 2. Statement and rewards core

- SPENDLY-105 Billing-cycle and statement intelligence
- SPENDLY-107 Cashback and rewards intelligence

### 3. Ingestion and intelligence

- SPENDLY-108 SMS matching and transaction ingestion
- SPENDLY-104 Analytics, trends and lifecycle insights

### 4. Portability

- SPENDLY-106 Statement import, export and document archive

## Per-ticket checklist

1. Confirm epic is started (gate above).
2. Pull `credit-cards-v2`, create ticket branch.
3. Move ticket to In Progress; comment scope/plan.
4. Implement; add pure utils + tests for financial logic.
5. Typecheck + tests; Manual Testing Guide + commands.
6. PR → `credit-cards-v2`; merge when green.
7. Jira comment with PR link; leave Done until final epic merge to `main`.
8. Continue to the next ticket in order.
