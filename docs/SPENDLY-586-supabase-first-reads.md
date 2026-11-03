# SPENDLY-586 — Supabase-first reads: epic tracker

- **Epic branch:** `feature/SPENDLY-586-supabase-first-reads` (from `main` `ac108974`, 2026-10-31)
- **Plan:** `docs/SPENDLY-586-plan.md`
- **ADR:** `docs/SPENDLY-586-adr.md`
- **Rules:** `docs/READ_MODEL_RULES.md`, `docs/AGENT_WORKFLOW.md`

| # | Story | Branch | State |
|---|---|---|---|
| 0 | SPENDLY-587 ADR and go/no-go | `feature/SPENDLY-587-adr-go-no-go` | **In Progress**, merged into the epic as `44fe02ae`. ADR drafted; awaiting the spike, the parity gate (7/14 on 2026-10-31), the post-633 baseline and user sign-off |
| 0 | SPENDLY-588 read inventory | `feature/SPENDLY-588-read-inventory` | **In Progress.** Read meter, code inventory and lab run done (`docs/SPENDLY-588-read-inventory.md`); post-633 console baseline pending |
| 1 | SPENDLY-589 sync Wave 2 | `feature/SPENDLY-589-sync-wave2` | **Merged into the epic** (`c2b13a14`); migration `20261031000000` applied to production |
| 1 | SPENDLY-590 sync Wave 3 | `feature/SPENDLY-590-sync-wave3` | **Merged into the epic** (`6c4b469f`); migration `20261101000000` applied to production |
| 1 | SPENDLY-591 remaining collections (`financialGoals` already synced, 609) | `feature/SPENDLY-591-sync-remaining` | **In Progress.** Parts A (19 flat collections) and B (nested watchlist items) built; C (`users/{uid}` settings) next |
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
- **2026-10-31, lab (588):** a cold launch is 464 billed reads on the seed, 62% of it `categories`; a relaunch within 30 min costs 1; screens and idle cost ~0. The read savings sit in the launch listeners, and `categories` can be fixed in Firestore alone (588 F7). This is an input to the 587 go/no-go.
- **2026-11-01, user decisions (plan v2):** go; **the app writes Supabase directly** (dual write through an `rm_client_apply` RPC; Firestore stays the truth, and the nightly repair has Firestore win); the offline source is an on-device SQLite copy; money values come from Supabase as exact copies. New stories P0 (the push records nothing) and N1–N6 are proposed in `docs/SPENDLY-586-plan.md` v2, waiting for approval before they go into Jira.
- **2026-11-02:** plan v2 approved. P0 = SPENDLY-662 (Done, verified in prod: 6 s copy). New stories N1–N6 = SPENDLY-669 (RPC), 670 (outbox), 671 (writers), 672 (sync safety net), 673 (read store), 674 (reference data). The descriptions of 587–601 were updated to v2.
- **2026-11-02, revisit for main `51c68dd7`:** watchlists (624: a nested collection), lend already deducted (668), card outstanding vs statement (675), light palettes (677). Updated 589, 591, 597, 598, 669, 671, 674. The first step of 587 is merging main into the epic branch.
- **2026-11-03 (587):** main `d670fc78` merged into the epic (521 test files, both typechecks green; pushed). **The spike passed 17/17** on local Docker Supabase (`supabase-readmodel/drills/spike-587/`). Finding: `rm_client_apply` must be **security definer** (invoker would need table write grants). ADR v2 written, with the rule wording proposed in §6, waiting for user approval.
- **2026-11-03 (669):** `rm_client_apply` migration `20261030000000` (security definer; allowlist, owner, shape, version guard, tombstones), with the server writers stamping `server` and Firestore winning. New `tests/client_apply.sql`; every SQL test passes locally on postgres:17; 50-row p95 3.58 ms. Not applied to production yet (dry run → approval).
- **2026-11-03:** the user approved the ADR v2 §6 rule wording, now applied to `CLAUDE.md` and `READ_MODEL_RULES` (`51cbabf3`). 669 merged into the epic (`d9357ed3`). **Migration `20261030000000` applied to production** after the checks (Postgres 17.11, no active queries, last sync finished). Verified: 24 new columns, 1,416 expense rows all `server`, `rm_client_apply` security definer, `authenticated` can execute it, `anon` can't, no client INSERT.
- **2026-11-03 (670):** the on-device client write outbox (`lib/readModelClientWrites.ts`, `shared/utils/readModel/clientOutbox.ts`), fed by `commitMutations`. Off unless `system_settings/global.readModel.clientWrites` is true; a no-op loopback in Spendly Test. 523 test files and both typechecks green. End-to-end needs a release plus the setting.
- **2026-11-03 (671):** direct writers of synced collections now call `noteDirectWrites`/`noteTransactionWrites` (`lib/readModelWriteHooks.ts`, `trackedBatch`): bills, splits, trips, spaces, category relabels, investment cash, the summary rebuild. A source-scan guard (mutation-checked) enforces it for every collection in the mapping. 524 test files green. **The user: no Android or web release until the epic is done.**
- **2026-11-03 (589):** Wave 2 (borrowings, repayments, receivables with 668 `source_mode`, subscriptions): migration `20261031000000`, mapping, purge, counts, data quality, allowlist; subscription writers routed. The SQL suite and 524 test files green. Production: the migration needs approval; the backfill is the first nightly full run after the epic reaches main (dry run first).
- **2026-11-03 (590):** Wave 3 (investments, the stock portfolio, investment cash, 9 EPF collections): migration `20261101000000`, a new `decimal` field type (`numeric(24,8)`, parity at 8 places), mapping, purge, counts, data quality, allowlist. The 671 guard now resolves name constants (`EPF_*_COLLECTION`), which found 8 unrouted writers; all routed. The SQL suite and 524 test files green. Production: the migration needs approval; backfill after the epic reaches main (dry run first).
- **2026-11-03:** 590 merged into the epic (`6c4b469f`). **Migration `20261101000000` applied to production** after the checks (no active queries, last sync succeeded 02:38 UTC). Verified: 14 Wave 3 tables with RLS, 32 owner-read policies, both allowlists include Wave 3, `anon` can't execute `rm_client_apply`, existing rows untouched (1,418 expenses).
- **2026-11-03 (591 part A):** 19 flat collections (budgets, decisions, reminders, fee reviews and dismissals, merchant overrides, recurring dismissals, spaces, rules, trips, runway, What-If, funding plans, SIP plans/transactions/positions, net-worth history, watchlist lists), migration `20261102000000`. The guard now also matches template paths; 5 writers routed. Trip and SIP plan ISO dates are copied as text.
- **2026-11-03 (591 part B):** watchlist items, the first nested collection (migration `20261102010000`). Key stays `(uid, doc_id)` with doc_id `"{listId}/{itemId}"`, so the RPC, tombstones, purge and RLS are unchanged; the mapper, push refs, push server, sync reader (`readmodelNestedPages.ts`), verify and drill learned the nested path.
