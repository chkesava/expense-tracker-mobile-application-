# SPENDLY-494: Jira tickets created and execution order

This file lists the Jira issues created on **2026-10-11** for the hybrid Firebase-write / Supabase-read initiative, and the order they should be worked in. Every issue below was confirmed in Jira after it was created.

- **Site:** https://kesavach.atlassian.net
- **Project:** `SPENDLY`
- **Full audit and plan:** [`HYBRID_READ_MODEL_AUDIT_AND_PLAN_2026-10-11.md`](HYBRID_READ_MODEL_AUDIT_AND_PLAN_2026-10-11.md)

---

## 1. Tickets created (27)

### 1.1 Epic

| Key | Priority | Summary |
|---|---|---|
| [SPENDLY-494](https://kesavach.atlassian.net/browse/SPENDLY-494) | High | Hybrid Firebase–Supabase Synchronization and Read Architecture |

### 1.2 Standalone correctness work (no epic parent)
These are kept outside the epic because they need fixing whether or not Supabase is ever adopted. They **block** epic stories.

| Key | Type | Priority | Summary | Blocks |
|---|---|---|---|---|
| [SPENDLY-495](https://kesavach.atlassian.net/browse/SPENDLY-495) | Bug | Highest | Fix dashboard period summaries: `categoryTotals` dotted keys in `set(merge)`, inconsistent category keys and month bucketing | 500, 510, 518 |
| [SPENDLY-496](https://kesavach.atlassian.net/browse/SPENDLY-496) | Bug | Highest | Balance-moving writes skip materialized account balance and net-worth updates (borrowings, receivables, investment-cash transfers, recurring posts, splits) | 500, 510, 514, 515 |
| [SPENDLY-497](https://kesavach.atlassian.net/browse/SPENDLY-497) | Bug | Highest | Credit-card materialized fields drift between rebuilds (`unbilledSpend`, `statementDue`, cycle fields, classification, bill `amountPaid`) | 500, 510, 516 |
| [SPENDLY-498](https://kesavach.atlassian.net/browse/SPENDLY-498) | Bug | Highest | Holding adjustments are never persisted: the batch is returned to `commitWrite` without `commit()` | 514, 517 |
| [SPENDLY-499](https://kesavach.atlassian.net/browse/SPENDLY-499) | Bug | High | Consolidate the three summary-rebuild implementations, fix reconciliation status flags, retire write-only `netWorth`/`investments` docs | 500, 503, 510, 518 |
| [SPENDLY-500](https://kesavach.atlassian.net/browse/SPENDLY-500) | Task | Highest | Production financial reconciliation: finish the SPENDLY-436 apply (HDFC variance) and the outstanding 417/419 backfills | 503, 515, 516 |
| [SPENDLY-501](https://kesavach.atlassian.net/browse/SPENDLY-501) | Task | Medium | Firestore read quick wins that need no Supabase (category hierarchy check, duplicate listeners, unbounded ledger queries) | — (relates to 502) |

### 1.3 Epic stories (parent SPENDLY-494)

| Key | Phase | Priority | Summary | Blocked by |
|---|---|---|---|---|
| [SPENDLY-502](https://kesavach.atlassian.net/browse/SPENDLY-502) | 0 | Highest | Architecture decision record, data-flow inventory and go/no-go (Blaze, Supabase project, read identity, cost) | — |
| [SPENDLY-503](https://kesavach.atlassian.net/browse/SPENDLY-503) | 0 | High | Financial correctness baseline: golden fixtures and a read-only per-user baseline report | 499, 500 |
| [SPENDLY-504](https://kesavach.atlassian.net/browse/SPENDLY-504) | 1 | High | Dedicated Supabase project, schema-as-code migrations and Wave 1 read-model tables | 502 |
| [SPENDLY-505](https://kesavach.atlassian.net/browse/SPENDLY-505) | 1 | High | Secure Firebase identity for Supabase reads (third-party auth + RLS, broker fallback) with cross-user security tests | 502, 504 |
| [SPENDLY-506](https://kesavach.atlassian.net/browse/SPENDLY-506) | 1 | High | Change capture: Firestore `onDocumentWritten` sync with idempotent, version-guarded upserts and delete tombstones (Wave 1) | 502, 504 |
| [SPENDLY-507](https://kesavach.atlassian.net/browse/SPENDLY-507) | 1 | High | Sync failure recovery, dead-letter replay and operational monitoring | 506 |
| [SPENDLY-508](https://kesavach.atlassian.net/browse/SPENDLY-508) | 1 | High | Purge the Supabase read model on account deletion and enforce data-lifecycle exclusions | 506 |
| [SPENDLY-509](https://kesavach.atlassian.net/browse/SPENDLY-509) | 2 | High | Resumable historical backfill and scheduled reconciler (count check, paged compare, repair from Firestore) | 506, 507, 508 |
| [SPENDLY-510](https://kesavach.atlassian.net/browse/SPENDLY-510) | 2 | High | Shadow validation: field-level parity, SQL-vs-TypeScript golden tests and the 14-day parity gate | 495, 496, 497, 499, 503, 509 |
| [SPENDLY-511](https://kesavach.atlassian.net/browse/SPENDLY-511) | 3 | Medium | Read-path abstraction with per-screen kill switch, freshness contract, pending-write overlay and Firestore fallback | 505, 510 |
| [SPENDLY-512](https://kesavach.atlassian.net/browse/SPENDLY-512) | 3 | Medium | Migrate Journal history beyond the staged window, month-range loads and Journal reports/export | 511 |
| [SPENDLY-513](https://kesavach.atlassian.net/browse/SPENDLY-513) | 3 | Medium | Migrate insights and range analytics, cash-flow history, ledger audit history and cashback history | 511 |
| [SPENDLY-514](https://kesavach.atlassian.net/browse/SPENDLY-514) | 4 (prereq) | Medium | Extend sync and parity to Wave 2/3 collections (borrowings, receivables, subscriptions, investments, holdings, EPF) | 496, 498, 510 |
| [SPENDLY-515](https://kesavach.atlassian.net/browse/SPENDLY-515) | 4 | Medium | Accounts and balances read migration | 496, 500, 512, 514 |
| [SPENDLY-516](https://kesavach.atlassian.net/browse/SPENDLY-516) | 4 | Medium | Credit cards and bills read migration | 497, 500, 515 |
| [SPENDLY-517](https://kesavach.atlassian.net/browse/SPENDLY-517) | 4 | Medium | Investments, EPF and FD read migration | 498, 514, 516 |
| [SPENDLY-518](https://kesavach.atlassian.net/browse/SPENDLY-518) | 4 | Medium | Net worth and dashboard read migration | 495, 499, 517 |
| [SPENDLY-519](https://kesavach.atlassian.net/browse/SPENDLY-519) | 5 | Low | Performance, security and cost validation | 518 |
| [SPENDLY-520](https://kesavach.atlassian.net/browse/SPENDLY-520) | 5 | Low | Rollback and recovery drills, operational runbook and production-readiness review | 519 |

### 1.4 Links to existing tickets ("Relates")

| New issue | Relates to |
|---|---|
| 494 (epic) | 423, 436, 422, 135, 2 |
| 495 | 430 |
| 496 | 426, 434, 418 |
| 497 | 427, 432 |
| 498 | 421 |
| 499 | 431, 428 |
| 500 | 436, 417, 419 |
| 501 | 416, 502 |
| 505 | 2 |
| 506 | 156 |
| 508 | 7 |
| 512 | 487 |

A comment was added to **SPENDLY-436** pointing to SPENDLY-500. SPENDLY-436 was **not** reopened.

---

## 2. Order of execution

The ordering rules:
- **Correctness first.** Nothing is synced or validated against balances that are known to be wrong.
- **A decision before infrastructure.** No Phase 1+ story starts until the ADR (502) records the go/no-go and Blaze decision.
- **No production reads move before the 14-day parity gate** (510).
- **Financial modules move one at a time:** accounts → cards → investments/EPF → net worth/dashboard.
- **One story at a time, with approval before each merge and before starting the next** (`docs/AGENT_WORKFLOW.md` §3).

### Step-by-step

| Step | Ticket(s) | Why it is here | Can run in parallel with |
|---|---|---|---|
| 1 | **SPENDLY-498** | Small P0: silent data loss (holding adjustments). Recommended first story | 501, 502 |
| 2 | **SPENDLY-496** | Balance updates missing on several write paths. Unblocks 500 | 501, 502 |
| 3 | **SPENDLY-497** | Credit-card stored fields drift | 501, 502 |
| 4 | **SPENDLY-495** | Dashboard period summaries broken | 501, 502 |
| 5 | **SPENDLY-499** | One rebuild implementation and truthful status flags. Must precede the production run | 501, 502 |
| 6 | **SPENDLY-500** | Production reconciliation, dry-run first, then an approved apply (436 HDFC, 417, 419) | 502 |
| — | **SPENDLY-501** | Read quick wins; feeds real numbers into the ADR | any time |
| — | **SPENDLY-502** | Go/no-go ADR. **Gate:** if no-go, stop here and close the epic | any time; must finish before step 8 |
| 7 | **SPENDLY-503** | Read-only correctness baseline and golden fixtures (needs 499 and 500) | 504 |
| 8 | **SPENDLY-504** | Dedicated Supabase project, migrations, Wave 1 tables | 503 |
| 9 | **SPENDLY-505** and **SPENDLY-506** | Read identity + RLS; change capture (both need 502 and 504) | each other |
| 10 | **SPENDLY-507** and **SPENDLY-508** | Failure recovery and monitoring; account-deletion purge (both need 506) | each other |
| 11 | **SPENDLY-509** | Backfill and reconciler (needs 506, 507 and 508) | — |
| 12 | **SPENDLY-510** | Shadow validation. **Gate:** 14 days of parity before any read moves | — |
| 13 | **SPENDLY-511** | Read-path abstraction, kill switch, freshness, fallback | — |
| 14 | **SPENDLY-512** and **SPENDLY-513** | First low-risk screen migrations (historical/reporting) | each other; 514 |
| 15 | **SPENDLY-514** | Extend sync to the Wave 2/3 collections (needs 510, 496 and 498) | 512, 513 |
| 16 | **SPENDLY-515** | Accounts and balances (needs 512, 514, 496 and 500) | — |
| 17 | **SPENDLY-516** | Credit cards and bills (needs 515, 497 and 500) | — |
| 18 | **SPENDLY-517** | Investments, EPF, FD (needs 516, 514 and 498) | — |
| 19 | **SPENDLY-518** | Net worth and dashboard (needs 517, 495 and 499) | — |
| 20 | **SPENDLY-519** | Performance, security, cost validation | — |
| 21 | **SPENDLY-520** | Rollback drills, runbook, readiness review → epic Done | — |

### Critical path

```
498 / 496 / 497 / 495 / 499  →  500  →  503 ─┐
                       502  →  504  →  506  →  507 + 508  →  509  →  510  →  511  →  512  →  515  →  516  →  517  →  518  →  519  →  520
                               504  →  505 ──────────────────────────────────┘ (into 511)
                                                         510  →  514 ──────────────→ 515, 517
```

### Gates

| Gate | Where | Condition to pass |
|---|---|---|
| Go/no-go | after 502 | The ADR records the user's decision. If no-go, the epic closes as Won't Do (495–501 still stand). If Blaze is refused (scheduled capture only), 515–518 are closed as Won't Do |
| Correct production data | after 500 | Post-apply dry-run shows zero variance, or every variance is explained |
| Parity | after 510 | 14 consecutive days with zero unexplained divergence, p95 lag within SLO, and no failures older than 24 h |
| Per-module flip | each of 512, 513, 515–518 | 7 days in shadow mode with zero diffs, then a user-approved switch to Supabase |
| Readiness | 520 | User sign-off on the runbook and drill results |

---

## 3. Intentionally not created

| Not created | Reason |
|---|---|
| A new home inside epic SPENDLY-423 | That epic is Done and covers Firestore-side materialization. Its leftover gaps were filed as bugs 495–499 instead |
| A backup/restore ticket | SPENDLY-135 already covers it. The read model is not a backup |
| A duplicate of SPENDLY-418 | It is superseded by 422/426. It was left open for the user to decide |
| A separate "idempotent create/update/delete" story | That work is part of 506 |
| A separate "divergence repair" story | That work is split between 509 (repair) and 510 (detection) |

## Story state (epic tracker)

| Key | State | Branch | Doc | Notes |
|---|---|---|---|---|
| SPENDLY-502 | Merged into the epic (`9cefa5e`); Done when the epic reaches main | `feature/SPENDLY-502-phase-0-adr-go-no-go` | `docs/SPENDLY-494-adr.md` | Production usage + inventory recorded; Blaze refused (option C); daily sync by default |
| SPENDLY-504 | Merged into the epic (`41685d7`); applied to `spmsgncjbnbkxvsbpqlu` and verified (14 tables, RLS 14/14, 0 client grants) | `feature/SPENDLY-504-supabase-project-schema` | `docs/SPENDLY-504-readmodel-schema.md` | Done when the epic reaches main |
| SPENDLY-505 | In Progress: built and tested; spike chose third-party auth (no broker); waiting for review + merge | `feature/SPENDLY-505-firebase-identity-supabase-reads` | `docs/SPENDLY-505-read-identity.md` | User setup: apply the policy migration, enable Firebase third-party auth, run the live check |
| Track A (495–500, 503, 563, 567) | Done on `main`; synced into the epic 2026-10-22 | — | the per-story docs | Production at zero variance (26/26) |
| SPENDLY-514–518 | Closed (`wont-do`): option C | — | — | ADR §0 |
| SPENDLY-506 | To Do: rewritten for option C (daily sync job) | — | — | |
