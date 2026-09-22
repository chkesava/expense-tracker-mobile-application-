# SPENDLY-102 Ledger V2 — Agent Guide

Epic: [SPENDLY-102](https://kesavach.atlassian.net/browse/SPENDLY-102) — Ledger Intelligence & Financial Journal  
Integration branch: `ledger-v2`

## Start gate (mandatory)

Do **not** create the integration branch, ticket branches, or implementation PRs until:

1. The epic `SPENDLY-102` status is **In Progress**, **or**
2. The user explicitly says to start SPENDLY-102 / ledger-v2

If the epic is still **To Do**, only answer questions or refine the plan. Do not code.

## Integration workflow

Same strategy as Accounts V2 (`accounts-v2` / SPENDLY-78):

1. When the epic is started, create `ledger-v2` from the latest `main` if it does not exist yet.
2. For every remaining ticket: pull latest `ledger-v2`, branch from it (`feat/SPENDLY-XXX-short-slug`).
3. Open each ticket PR against `ledger-v2`.
4. Merge into `ledger-v2` after checks pass.
5. Do **not** merge `ledger-v2` → `main` until every epic ticket is complete and the user explicitly requests the final merge.
6. Keep tickets out of **Done** while changes exist only on `ledger-v2`.

## Architecture rules

- The ledger remains the canonical financial activity model; no parallel journal.
- Reuse existing account, expense, income, transfer, payment, cashback, and investment models.
- Never double-count transfers, bill payments, cashback, borrowings, receivables, or investment movements.
- Prefer auditable reversals/compensating records over destructive deletes of financial history.
- Derived metrics use pure calculation utilities with regression tests.
- Large-ledger screens must preserve staged/complete loading; never compute authoritative totals from truncated data.

## Required ticket order

Unless the user explicitly changes it:

### 1. Foundation and transaction experience

- SPENDLY-109 Advanced Journal search and transaction filtering
- SPENDLY-111 Ledger running balance and period intelligence

### 2. Detail, correction, and integrity

- SPENDLY-110 Journal transaction detail, audit trail and correction workflow
- SPENDLY-112 Ledger audit, data-quality and reconciliation center

### 3. Reports and export

- SPENDLY-113 Journal reports and export suite

### 4. Duplicate check before implementing

- SPENDLY-114 Journal transaction detail, audit trail and correction workflow  
  **Note:** Title/scope match SPENDLY-110. Before implementing, confirm with the user whether this is a duplicate. If duplicate, close/link it after SPENDLY-110 lands; do not implement twice.

## Per-ticket checklist

1. Confirm epic is started (gate above).
2. Pull `ledger-v2`, create ticket branch.
3. Move ticket to In Progress; comment scope/plan.
4. Implement; add pure utils + tests for financial logic.
5. Typecheck + tests; Manual Testing Guide + commands.
6. PR → `ledger-v2`; merge when green.
7. Jira comment with PR link; leave Done until final epic merge to `main`.
8. Continue to the next ticket in order.
