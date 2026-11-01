# SPENDLY-586 — Supabase-first reads and dual writes: implementation plan (v2)

**v2, 2026-11-01.** It replaces the v1 plan of 2026-10-31.

**The user's decisions (2026-11-01):**

| Decision | Choice |
|---|---|
| Go/no-go | **Go**: the whole app reads from Supabase |
| Write path | **The app writes Supabase directly**: every write goes to Firestore **and** Supabase |
| Offline | **An on-device copy of the user's Supabase rows** (SQLite) |
| Money values | **From Supabase, as exact copies** of Firestore's stored totals; net worth by the same app code over Supabase rows |

**Epic branch:** `feature/SPENDLY-586-supabase-first-reads`, worktree `C:\dev\worktrees\spendly-586`.

**The rules every story follows:** `docs/AGENT_WORKFLOW.md`, `CLAUDE.md` and `docs/READ_MODEL_RULES.md`. Each story goes through its own branch, then approval, then a `--no-ff` merge into the epic.

---

## 0. Where things stand (2026-11-01)

| Item | State | Evidence |
|---|---|---|
| 587 ADR | Merged into the epic, In Progress | Must be **rewritten for v2** (story 587 below) |
| 588 read inventory | Merged into the epic, In Progress | Lab: a cold launch was 464 reads, 62% `categories` |
| SPENDLY-660 (categories by revision) | **On main `8a66d9dc`, Done; not released** | Lab: 464 → 178 reads per cold launch |
| Parity gate (SPENDLY-510) | **8 / 14** | Health run 41287555747; passes around 11-07 |
| **Per-write push (SPENDLY-583)** | **Broken: 0 pushes recorded since it went live (10-31)** | 6 health runs show "—", against ~113 Firestore writes a day. The function is configured (it answers 401, not 202 "disabled"), so the app's requests either never arrive or are rejected at the token check, which isn't counted. See story **P0** |
| Firestore reads | **21K / 24 h** (user screenshot, Oct 31–Nov 1) | The **~4K spike at ~6 AM IST is the nightly full sync** (4,106 reads). The other spikes are app launches and Firebase console browsing (the console counts its own reads) |

---

## 1. Target architecture

```
WRITE (every save)
  screen → service → commitMutations ─┬─► Firestore            (truth; offline queue; rules)
                                      └─► Supabase outbox (on device, durable)
                                             └─► rm_client_apply RPC (RLS, allowlist, version guard) ─► Supabase rows
  server writers (epf-cron, scripts) ─► readmodel-push core ─► Supabase rows
  nightly: incremental sync + parity repair (Firestore wins)  ─► Supabase rows

READ (every screen)
  Supabase rows ─► realtime ping ─► refetch changed rows ─► on-device SQLite copy ─► providers ─► screens
                                     this device's outbox ─┘ (own writes show at once, offline too)
  fallback per collection: Firestore (kill switch system_settings/global.readModel.<key>)
```

### Invariants (new or changed by v2)

1. **Firestore stays the source of truth.** If Supabase and Firestore disagree, Firestore wins: the nightly parity repair rewrites the Supabase row. Dual writes exist for speed and for read savings, not for ownership.
2. **One mapper.** The client and the server build Supabase rows with the same `shared/utils/readModel/mapping.ts` `TableSpec`s from the same Firestore document. The client maps the document as Firestore's local cache holds it right after the write (latency-compensated, 0 billed reads).
3. **Clients write only through `rm_client_apply`.** It is an RPC, `security invoker`, granted only to `authenticated`, that:
   - accepts allowlisted tables only;
   - requires `uid = readmodel_auth.uid()` on every row;
   - applies a version guard (a newer client write or a Firestore-sourced row is never overwritten by an older one);
   - turns deletes into tombstones.

   Tables stay **SELECT-only** for clients; there are no direct table write grants.
4. **The duress, local-test and signed-out states never write or read Supabase**, unchanged.
5. **No display number gets a second owner.** Stored totals are copies (`financialSummaries`, `currentBalance`, `currentOutstanding`). Derived numbers (net worth, safe-to-spend, budget progress) come from the existing TypeScript helpers over Supabase rows. SQL never computes a displayed number.
6. **Every collection keeps a Firestore fallback and a server-side kill switch.** Promotion goes firestore → shadow (7 days with zero differences; 14 for money screens) → supabase, approved by the user.
7. **Production changes:** dry run → report → approval → apply. Migrations are additive.

### Main risks and how the stories contain them

| Risk | Containment |
|---|---|
| The two writes diverge: one lands, the other doesn't (offline, crash, rejected) | Durable outbox with retry. Nightly parity repair with Firestore winning. A divergence metric in the health summary (N4) |
| A modified or buggy client writes bad rows | The RPC validates the shape and the owner; it only affects that user's own rows; the nightly repair restores them from Firestore |
| A writer outside `commitMutations` skips Supabase | Writer inventory, plus a guard test that fails for an unrouted writer (N3), as SPENDLY-660 did for categories |
| The on-device copy is stale or leaks | Realtime plus refetch since the last `synced_at`. Cleared on sign-out and account deletion. Never in duress. Size cap |
| Supabase pauses (Free plan) or goes down | Pro before the first money screen flips (595). The per-collection fallback to Firestore. The outbox backlog drains on recovery |

---

## 2. Stories

Keys are existing Jira keys where they exist, and **N1–N6 for new stories**, created once the user approves this plan. Each story lists what it changes and its exit gate.

### Phase 0 — fix, decide, measure

| Key | Story | Changes | Exit |
|---|---|---|---|
| **P0 (new, bug)** | **The per-write push copies nothing** | **Confirmed 2026-11-01:**<br>• Netlify logs show the app's requests arrive (~17 calls Oct 31–Nov 1, 150–660 ms each, no errors logged).<br>• `push_daily` has **no rows ever**.<br>• Expenses changed in the last 48 h reached Supabase **8–15 h** later, so only the nightly sync copied them.<br>Every Supabase-side failure throws and would be logged, so the requests stop at the **token check**: `verifyIdToken(token, true)` fails and returns 401, which is neither logged nor counted. **Most likely, `FIREBASE_SERVICE_ACCOUNT` on the `spendly-share` site is for a different Firebase project than `expenseapp-27f94`.**<br>**Fix:** log the rejection reason (the error code only), count rejections in `push_daily`, check the `rpc` errors in `record`, and correct the Netlify env. Needs one web deploy | Health shows pushes > 0 per day; a save on device A appears in Supabase within 10 s |
| **587** | **ADR v2 + rule changes + spike** | Rewrite `docs/SPENDLY-586-adr.md` for the user's v2 decisions. Change READ_MODEL_RULES R1.1 (client writes via `rm_client_apply` only) and the read-model paragraph of `CLAUDE.md` (**the user approves the wording**). Spike, on local Docker Supabase: (a) the `rm_client_apply` RPC and (b) a Realtime Broadcast ping, both under Firebase-issued tokens, including the duress and expired-token cases | The user signs off; the spike passes |
| **588** | **Read inventory: production baseline** | Add the post-660 and post-633 7-day console reads to the report | Baseline recorded |

### Phase 1 — coverage: every collection a screen reads

| Key | Story | Notes |
|---|---|---|
| **589** | Sync Wave 2: borrowings, repayments, receivables, subscriptions | As in the R2 contract. **Plus** each table goes on the `rm_client_apply` allowlist |
| **590** | Sync Wave 3: investments, holdings, portfolio, investment cash, EPF | Money precision (`numeric`); `epf-cron` server writes go through the push core |
| **591** | Sync the remaining collections from the 588 inventory: budgets, decisions, reminders, fee reviews, merchant overrides, settings, runway, what-if, SIP… | Out: Nutrition, Ganesh, duress trees, `meta/*` (except as N2 needs), shared top-level `splits`/`vaults`/`paymentRequests` unless the ADR adds them |
| **592** | Copy the stored money values | `financialSummaries` (dashboard months, EPF), typed `currentBalance`/`currentOutstanding`. Field parity nightly; a guard test that no display total is computed in SQL |

### Phase 2 — the write path (new)

| Key | Story | Changes | Exit |
|---|---|---|---|
| **N1** | **`rm_client_apply` RPC** | A migration: the function (an allowlist, an owner check, the version guard: `client_written_at` vs `source_update_time`, tombstones), `revoke … from public, anon`, `grant execute … to authenticated`. New columns `written_by` (`client`/`server`) and `client_written_at`. `assert_security.sql` and `rls_behaviour.sql` cover cross-user writes, duress, expired tokens and non-allowlisted tables. Drills re-run | The SQL suite and drills are green; perf p95 is under 100 ms per batch of 50 |
| **N2** | **The on-device Supabase outbox** | `commitMutations` hands the written paths to the outbox. The outbox reads each document from the Firestore cache, maps it with the shared mapper, persists the entry (SQLite, with N5), and sends batches to `rm_client_apply` with backoff. Each entry is idempotent on `(table, doc_id, client_written_at)`. Nothing is sent in duress or local-test mode; in Spendly Test the loopback is used. The SPENDLY-583 push stays for server writers and as a fallback | Airplane-mode, kill-app and Supabase-down tests: every write lands once, in order. Unit tests for the mapper path and the retry |
| **N3** | **Route every direct writer** | Inventory the writers outside `commitMutations` (bills, borrowings/receivables, EPF, investment cash, splits, categories via 660's `noteCategoriesWritten`…). Move each into `commitMutations` or the outbox hook. A guard test fails for an unrouted writer of a synced collection | Guard green; the outbox count matches Firestore writes in the lab |
| **N4** | **The sync becomes the safety net, not the copier** | The nightly run becomes changed-only (`updatedAt`) plus parity repair (Firestore wins), with a weekly full run. Health reports the divergence count (client rows the repair had to rewrite) and the outbox backlog | Nightly Firestore reads drop from ~4.1K to well under 1K; the divergence count is reported |

### Phase 3 — read foundations

| Key | Story | Changes |
|---|---|---|
| **593** | **Realtime** | Broadcast ping on a private `user:<uid>` topic (`realtime.messages` RLS via `readmodel_auth.uid()`). The ping carries `{table, doc_id, synced_at}` only. The client refetches. One channel per user; `setAuth` on token refresh; a fallback to polling `max(synced_at)` |
| **594** | **The on-device Supabase copy (SQLite)** | `expo-sqlite` (a native module, so a new build). Hydrated on sign-in, kept fresh by realtime and refetch since the last `synced_at`. This device's outbox is overlaid. Cleared on sign-out and account deletion; never in duress; size cap. Web: IndexedDB through the same interface |
| **N5** | **The read store and provider switch** | One read-store API over the SQLite copy (`query`, `subscribe`). Each provider (`FinanceDataProvider`, `ExpenseReferenceDataProvider`, `CreditCardBillsProvider`, `BorrowingsReceivablesProvider`, the investments/EPF hooks…) reads the store when `readModel.<collection>` is `supabase`, and keeps its Firestore listener only in `firestore`/`shadow` mode. Shadow compares the two |
| **595** | **The Supabase plan** | Pro ($25/month) before the first money screen flips. Daily backups verified by a restore drill. Pause and limit alerting |

### Phase 4 — collections and screens flip (each: shadow, then 7 days / 14 for money, then the user approves)

| Key | Scope | Gate |
|---|---|---|
| **596** | The live Journal + recent activity (`expenses`, `incomes`, `ledgerEvents`) | 7 days |
| **597** | Accounts, balances, cards, bills | 14 days, balances to the paisa |
| **598** | Investments, EPF, FD, loans, subscriptions | 14 days |
| **599** | Dashboard tiles, net worth, budgets, safe-to-spend, goals | 14 days on every tile |
| **N6** | Reference data: categories, spaces, rules, reminders, settings documents | 7 days |

### Phase 5 — savings and readiness

| Key | Story |
|---|---|
| **600** | Turn off the Firestore listeners per collection once every consumer is on `supabase`; measure 7 days before and after each step |
| **601** | Drills and runbook: Supabase down while writing (the outbox backlog drains), an RPC rejection, a dual-write divergence (repair), realtime down, airplane mode, Supabase paused, every collection back to Firestore in one switch, a bad mapping on a money table. Readiness review against §1. The user signs off |

---

## 3. Order and critical path

```
P0 push fix ─────────────────────────────┐
587 ADR v2 + spike (needs Docker) ───────┼─► N1 RPC ─► N2 outbox ─► N3 writers ─► N4 sync
588 baseline (console)                   │
589 / 590 / 591 / 592 coverage ──────────┘ (in parallel, each with parity days)
                       593 realtime ─► 594 SQLite copy ─► N5 read store
                                                   └─► 596 → 597 → 598 → 599 → N6 (shadow periods)
                                                                     595 Pro before 597
                                                                               └─► 600 ─► 601
```

**Effort:** this is now the largest epic in the repo. It adds a second write path, a native local database and a new provider read layer, on top of v1's sync and screen work. Expect **10–14 weeks** of calendar time, much of it shadow and parity periods. Phases 1 and 2 can overlap.

---

## 4. What the user needs to do first

1. **Netlify function logs for `readmodel-push`** (Netlify → the `spendly-share` site → Functions → `readmodel-push` → Logs), around a time you saved an expense. That makes P0 a quick fix.
2. **Install Docker Desktop** (`winget install Docker.DockerDesktop`, then open it once) for the 587 spike.
3. **Approve this v2 plan.** Then I create N1–N6 and P0 in Jira and update the descriptions of 587, 589–601 to match.
4. **Release SPENDLY-660** (Release — Expense). It's independent of this epic and cuts ~60% of cold-launch reads now.
