# SPENDLY-586 — Supabase-first reads: epic tracker

- **Epic branch:** `feature/SPENDLY-586-supabase-first-reads` (from `main` `ac108974`, 2026-10-31)
- **Plan:** `docs/SPENDLY-586-plan.md`
- **ADR:** `docs/SPENDLY-586-adr.md`
- **Rules:** `docs/READ_MODEL_RULES.md`, `docs/AGENT_WORKFLOW.md`

| # | Story | Branch | State |
|---|---|---|---|
| 0 | SPENDLY-587 ADR and go/no-go | `feature/SPENDLY-587-adr-go-no-go` | **In Progress**, merged into the epic as `44fe02ae`. ADR drafted; awaiting the spike, the parity gate (7/14 on 2026-10-31), the post-633 baseline and user sign-off |
| 0 | SPENDLY-588 read inventory | `feature/SPENDLY-588-read-inventory` | **In Progress.** Read meter + code inventory done (`docs/SPENDLY-588-read-inventory.md`); lab runs and post-633 console baseline pending |
| 1 | SPENDLY-589 sync Wave 2 | — | To Do; gated on D7 |
| 1 | SPENDLY-590 sync Wave 3 | — | To Do; gated on D7 |
| 1 | SPENDLY-591 remaining collections (`financialGoals` already synced, 609) | — | To Do; gated on D7 + 588 |
| 2 | SPENDLY-592 copy authoritative values | — | To Do |
| 2 | SPENDLY-593 realtime (Broadcast ping + refetch, ADR D2) | — | To Do |
| 2 | SPENDLY-594 offline (Firestore cache, ADR D1) | — | To Do |
| 2 | SPENDLY-595 Supabase plan | — | To Do |
| 3 | SPENDLY-596 live Journal | — | To Do |
| 3 | SPENDLY-597 accounts, cards, bills | — | To Do |
| 3 | SPENDLY-598 investments, EPF, loans, subs | — | To Do; behind the 600 checkpoint (ADR D7) |
| 3 | SPENDLY-599 dashboard, net worth, budgets | — | To Do; behind the 600 checkpoint; net worth via `composeNetWorth`, not a copy (ADR D3) |
| 4 | SPENDLY-600 listeners off + measure | — | To Do |
| 4 | SPENDLY-601 drills and readiness | — | To Do |

## Decisions

- **2026-10-31:** SPENDLY-583 is live (web deploy `41178735321`; push and claims return 401, not 404).
- **2026-10-31:** ADR drafted. Every decision is RECOMMENDED until the user signs off on SPENDLY-587.
- **2026-10-31:** 588 uses the lab + console method (ADR D5) instead of production telemetry. Every read is metered once, in the `@/lib/firestore` adapter, in dev and perf builds only.
