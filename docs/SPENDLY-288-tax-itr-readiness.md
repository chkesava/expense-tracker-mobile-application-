# SPENDLY-288: Tax & ITR Readiness Center

**Epic branch:** `feature/SPENDLY-288-tax-itr-readiness`, cut from `main` at `b5837d18`.

**Worktree:** `C:\dev\worktrees\spendly-288`.

**Plan:** [SPENDLY-288-plan.md](SPENDLY-288-plan.md), approved by the user on 2026-11-07 with D1–D9 as recommended.

## The problem
Spendly users get no help preparing for their Indian income-tax return. Income, TDS, deductions, capital gains, tax payments, documents and deadlines are scattered.

The epic adds a readiness workspace with this flow:
- track
- organize
- reconcile
- estimate
- prepare
- review
- export

It does **not** file a return, and it does not give tax advice.

## Stories

The order below is the proposed working order (plan §4).

| Story | Scope | State |
|---|---|---|
| SPENDLY-289 | FY/AY model and tax data contract (pure) | Merged to the epic branch (`97c0a32b`) |
| SPENDLY-709 | Tax persistence, dual write and read model | Merged to the epic branch (`7c81a35e`); main synced and migration restated over 222's 20261108 (`df6a5edf`); rules, indexes and Supabase migration 20261110000000 pending deploy |
| SPENDLY-290 | Income aggregation and tax center shell | Merged to the epic branch (`1e263979`); UI approved by the user |
| SPENDLY-298 | Tax document center (vault and attach) | Merged to the epic branch (`266fbc08`); `spendly-files` Edge Function deploy pending (SPENDLY-711 is on main) |
| SPENDLY-291 | TDS, Form 16/16A and AIS/TIS/26AS reconciliation | In progress on `feature/SPENDLY-291-tds-reconciliation` |
| SPENDLY-292 | Deductions tracker | Planned |
| SPENDLY-294 | Advance-tax and self-assessment payments | Planned |
| SPENDLY-293 | Capital-gains lots and classification | Planned |
| SPENDLY-295 | Calculation engine and regime comparison | Planned |
| SPENDLY-296 | Readiness dashboard and checklist | Planned |
| SPENDLY-297 | Calendar deadlines and reminders | Planned |
| SPENDLY-710 | Exportable readiness summary | Planned (D4) |
| SPENDLY-299 | QA, privacy, accuracy and rollout | Planned |

## Decisions
All of D1–D9 (plan §6) were approved as recommended on 2026-11-07:
- **D1:** persistence and the read model are split into SPENDLY-709.
- **D2:** the calculation engine fully supports FY 2025-26 first.
- **D3:** five synced collections.
- **D4:** the document center (298) moves earlier; the export is SPENDLY-710.
- **D5:** the user's PAN is never stored; the deductor's TAN is stored and masked.
- **D6:** SPENDLY-711 makes account deletion remove `spendly-files` objects. It blocks 298.
- **D7:** missing cost basis is shown as missing, and a statement total replaces the derived rows for its class.
- **D8:** the tax center asks for the PIN once per session.
- **D9:** feature flag `taxCenterEnabled`.

**Year terms (SPENDLY-289):** FY ≤ 2025-26 is labelled FY/AY under the 1961 Act. From 2026-27 the label is "Tax year" under the Income-tax Act, 2025. Details: [SPENDLY-289-tax-model.md](SPENDLY-289-tax-model.md).
