# SPENDLY-288: Tax & ITR Readiness Center

**Epic branch:** `feature/SPENDLY-288-tax-itr-readiness`, cut from `main` at `b5837d18`.

**Worktree:** `C:\dev\worktrees\spendly-288`.

**Plan:** [SPENDLY-288-plan.md](SPENDLY-288-plan.md), a draft awaiting the user's approval.

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
| SPENDLY-289 | FY/AY model and tax data contract (pure) | Planned |
| NEW-T1 | Tax persistence, dual write and read model | Proposed (D1) |
| SPENDLY-290 | Income aggregation and tax center shell | Planned |
| SPENDLY-298 | Tax document center (vault and attach) | Planned (moved earlier, D4) |
| SPENDLY-291 | TDS, Form 16/16A and AIS/TIS/26AS reconciliation | Planned |
| SPENDLY-292 | Deductions tracker | Planned |
| SPENDLY-294 | Advance-tax and self-assessment payments | Planned |
| SPENDLY-293 | Capital-gains lots and classification | Planned |
| SPENDLY-295 | Calculation engine and regime comparison | Planned |
| SPENDLY-296 | Readiness dashboard and checklist | Planned |
| SPENDLY-297 | Calendar deadlines and reminders | Planned |
| NEW-T2 | Exportable readiness summary | Proposed (D4) |
| SPENDLY-299 | QA, privacy, accuracy and rollout | Planned |

## Decisions
Pending: D1–D9 in the plan, §6.
