# SPENDLY-586 — Supabase-first reads: implementation plan

**Status:** plan only, written 2026-10-31 from `main` `ac108974`. Nothing is implemented. Epic and stories 587–601 are To Do in Jira.
**Epic branch (when work starts):** `feature/SPENDLY-586-supabase-first-reads`, cut from `main`; one branch per story, cut from it (`docs/AGENT_WORKFLOW.md` §3).
**Rules that bind every story:** `CLAUDE.md` safety invariants, `docs/READ_MODEL_RULES.md` (R1–R7), `docs/AGENT_WORKFLOW.md`.

---

## 0. Where things stand (checked 2026-10-31)

| Precondition (epic "Depends on") | Evidence | State |
|---|---|---|
| SPENDLY-510 14-day parity gate | Health run `41153306559` (2026-10-31 01:02 UTC): **"Parity gate: 7 of 14 clean days"**, 0 open failures; nightly sync runs green 10-23 → 10-30 | **Not met.** Earliest pass is **~2026-11-07**, if every night is clean (the epic said ~11-05) |
| SPENDLY-583 per-write push deployed | Same health run: **"Per-write pushes today: —"**. The last Deploy Web run that succeeded was 2026-10-23 (`39950019574`); the redeploy with fix #238 (`39952284142`) was cancelled | **Met on 2026-10-31.** The user's web deploy `41178735321` succeeded, and both functions now return 401 to an unauthenticated probe instead of 404 |
| Supabase plan | Free, project `spmsgncjbnbkxvsbpqlu` | Unchanged |

**Update 2026-10-31:** 587 is In Progress; see `docs/SPENDLY-586-adr.md`.

**So:** no story can *finish* yet. 587 (ADR) can be **drafted and spiked** now, and 588 (read inventory) can start now. Neither changes production data.

### Drift between Jira, the docs and the repo (to fix on the epic, not silently)
1. **Coverage is 12 collections, not 10.** `financialGoals` and `goalEvents` are synced (SPENDLY-609, `shared/utils/readModel/mapping.ts:159-173`, migration `20261029000000`). The epic description and `READ_MODEL_RULES.md` §2 ("Synced today") still list 10. **591 must drop `financialGoals`** from its candidates.
2. **A sixth read-path screen exists:** `goals` (SPENDLY-611) is in `READ_MODEL_SCREENS`. The epic says "five history screens".
3. **SPENDLY-633 changed the offline premise.** The epic was written when native Firestore persistence was memory-only. 633 (on `main`, RNFB 24 durable cache) makes Firestore's on-device cache **persistent** on native. That strengthens 587 offline option (b) and weakens the case for building our own SQLite cache in 594 (see §3, D1).
4. **588 as written conflicts with R1.1.** It suggests sending read counts "to the read model". An app-side Supabase write is forbidden (R1.1), and there is no analytics vendor (`lib/shortcutTelemetry.ts` is console-only). See §3, D5.
5. **The 494 parity gate date** moved from ~11-05 to ~11-07.

---

## 1. Invariants every story preserves

1. **Firestore is the only write path.** No app, Netlify or Edge write to Supabase beyond the sync, the push and the purge (R1.1).
2. **One owner per number.** Displayed balances, dues, tiles, net worth and budgets are **copies** of Firestore's materialized values (`financialSummaries`, account balance fields). They are never recomputed in SQL or in a component (R3.6, R4.2, CLAUDE.md).
3. **`firestore` mode is byte-for-byte today's behaviour**, with no read-model connection, proved by a test per screen key (R3.2).
4. **Every screen key has its own kill switch** (`system_settings/global.readModel.<key>`, server-only writable) and a **bounded** Firestore fallback (R3.3, R3.9).
5. **Duress never reads, caches or subscribes to Supabase** (`effectiveReadModelMode`, `readmodel_auth.uid()`).
6. **Promotion ladder:** firestore → shadow → 7 clean days (14 for 599) → supabase, each step approved by the user (R3.9).
7. **Production:** dry run → report → approval → apply (R7.2). One shared Firebase project, so QA runs on Spendly Test or the emulator only.
8. **Listeners only come off when every consumer of that listener is migrated** (600). Shared providers are never half-removed.

---

## 2. Target architecture (what "done" means)

```
 write:  screen → service → commitMutations ──► Firestore ──► readmodel-push (seconds) ──► Supabase rows
                                   │                     └─► nightly full sync (safety net + parity)
                                   └─► pending-write overlay (this device, instant)

 read:   screen → resolveReadModelBackend(key) ─┬─ firestore (default / fallback / duress / offline per D1)
                                                ├─ shadow   (serve Firestore, diff Supabase, log)
                                                └─ supabase (rows + realtime store + overlay + freshness badge)
```

New pieces the epic adds, each one shared rather than built per screen:
- **`lib/readModel/realtimeStore.ts`** (593): one channel per user, a table → row map, resubscribe and refetch since the last `synced_at`.
- **An offline source** (594): its shape depends on D1.
- **Copied summary tables** (592): `financial_summaries`, plus typed balance columns on `accounts`.
- **New screen keys** in `READ_MODEL_SCREENS`: `journalLive`, `accounts`, `cards`, one per module for 598, `dashboard` and `budgets`.

---

## 3. Decisions 587 must settle (my recommendation and why)

| # | Decision | Options | Recommendation | Evidence to gather in 587 |
|---|---|---|---|---|
| **D1** | Offline | (a) own SQLite cache of read-model rows; (b) Firestore's persistent cache stays the offline source; (c) no offline | **(b)** for every money screen. It is now durable on native (633), and offline reads are exactly what `effectiveReadModelMode` already does (`!online → firestore`). **Consequence:** 600 can't remove a listener whose collection must still work offline, unless (a) is built for it. | Airplane-mode test on Spendly Test with listeners off: is the cache still warm enough? Cache age after N days with no listener |
| **D2** | Realtime | Supabase Realtime `postgres_changes` under RLS, or polling `synced_at` | **Realtime, gated by a spike.** Under **third-party (Firebase) auth**, RLS policies call `readmodel_auth.uid()`, and Realtime must evaluate them per subscriber. This is unproven here. Polling is the fallback design | Spike on the drill project: subscribe as user A, write as B, confirm A sees nothing; latency; Free-plan limits (concurrent connections, messages/month) from **live, dated** pricing pages |
| **D3** | Number ownership | Copy summaries vs recompute | **Copy only** (non-negotiable). Confirm `financialSummaries` writes go through `stageMutationOps` → `commitMutations` (they appear in `lib/stageMutationOps.ts`, `lib/summaryMonthStore.ts`, `shared/features/epf/utils/summarySync.ts`), so the push covers them. **EPF summary sync is a server-confirmed path (653): verify it reaches the push** | grep every `financialSummaries` writer; a list of the server writers (`epf-cron`) that bypass the push |
| **D4** | Supabase plan | Free vs Pro ($25/mo) | **Pro, before the first money screen flips to `supabase`** (597). Not needed for Phase 0–2. As the primary read path, a Free pause = every screen on fallback, and there are no backups | Live pricing pages, dated; current DB size (~3 MB) × projected growth from 589–591 |
| **D5** | Success metric and 588 telemetry | Production per-screen telemetry vs lab measurement | **Lab plus console:** (1) scripted cold launch and steady state on Spendly Test, with the existing `lib/firestoreReadDebug.ts` counters enabled by a perf flag, giving per-listener counts; (2) the Firebase console's daily reads (7-day export) for the real total. No production writes and no new Supabase writer. Production per-screen telemetry would need a new Netlify collector (credits) or an R1.1 exception, which only the user can grant | The ranking table from (1); the console export from (2) |
| **D6** | Net read budget | — | **Must be in the ADR.** Every collection added in 589–592 is re-read **in full every night** by the sync (budget 6K/run, 12K/day). The savings from 600 must exceed the added nightly cost, or the epic loses reads. Today: ~18K app + ~4.3K sync per day, against 50K | Doc counts per new collection across all users × 1 read each, nightly |
| **D7** | Go/no-go | — | **Go only if** D2's spike passes, D6 shows a net saving, and the user accepts D4's cost. Otherwise Won't Do, and keep the six read-path screens | — |

**I recommend a scoped "go":** history screens (done), plus the live Journal (596), plus accounts and cards lists (597). Put 598/599 behind a second checkpoint after 600 has measured real savings from 596/597. This is offered to the user in 587, not decided for them.

---

## 4. Story plan

Each story has: its own branch → a Jira comment → **stop for merge approval** → **ask before the next story**. Its doc is `docs/SPENDLY-<n>-<slug>.md`, and the tracker is `docs/SPENDLY-586-supabase-first-reads.md` (created with 587).
Validation every time: `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit`, plus the `readmodel-schema.yml` SQL suite when `supabase-readmodel/` changes, plus drills when the sync, mapping or migrations change.

### Phase 0: go/no-go (can start now)

**587: ADR and go/no-go.** *Docs and a spike; no app change.*
- Files: `docs/SPENDLY-586-adr.md`, `docs/SPENDLY-586-supabase-first-reads.md` (tracker), a spike script under `supabase-readmodel/drills/` (realtime-RLS against `demo-readmodel-drill`, never prod).
- Content: D1–D7 above, each with alternatives, evidence, choice, consequences and rollback.
- Fix the drift: `READ_MODEL_RULES.md` §2 (12 collections, 6 screen keys), only if the user approves editing that doc in this story.
- Exit: ADR merged; **user signs off in a Jira comment**; can't close before the 510 gate passes and 583 is live (both are inputs).

**588: read inventory.** *In parallel with 587.*
- Files: `lib/firestoreReadDebug.ts` (a perf-flag export of per-feature counts, no PII; already attributes by `feature`), a scenario script driving Spendly Test (cold launch → dashboard → journal → accounts → idle 10 min), `docs/SPENDLY-588-read-inventory.md`.
- Check first: which listeners are tagged with a `feature`. Add tags where missing (providers: `FinanceDataProvider` expenses/incomes at L678/692 plus the group at L708–860, `CreditCardBillsProvider`, `BorrowingsReceivablesProvider`, `LedgerStateProvider`, `ExpenseReferenceDataProvider`, `RemindersInboxProvider`, `UserDocProvider`, `SettingsProvider`).
- Tests: the attribution unit tests in `lib/firestoreReadDebug.test.ts`; counters are a no-op when the flag is off.
- Exit: a ranking table (cold vs steady state per listener), the console 7-day total, and a recommended migration order into the ADR. **Jira says "one week of production data"; under D5 that becomes lab plus console, a change the user must accept.**

### Phase 1: coverage (after a "go")

The pattern is identical for 589/590/591 (R2.1): a migration (contract columns, PK `(uid, doc_id)`, `(uid, …)` indexes, RLS owner-read, `grant select … to authenticated`, **added to the `supabase_realtime` publication if D2 = realtime**), a `TableSpec` in `shared/utils/readModel/mapping.ts`, the purge (`netlify/functions/_readmodelPurge.ts` + purge migration), `tests/assert_security.sql`, `tests/rls_behaviour.sql`, `tests/purge.sql`, push coverage (`netlify/functions/_readmodelPushCore.ts` allow-list, listener `notifyReadModelSnapshot` hooks), a sync-core test, a golden fixture, and drills re-run.
Production: **dry-run backfill → report → approval → apply**; then 14 clean parity days per new table.

- **589 Wave 2:** `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments`, `subscriptions`. Watch: receivable repayment totals (605) are copied, not summed.
- **590 Wave 3:** investments, holdings, `portfolioTransactions`, `investmentCashTransactions`, `portfolioSettings`, EPF. Watch: the numeric precision of quantities and units (typed `numeric`, never float); `reversalOf`; EPF month bucketing; **`epf-cron` server writes need a push call or accept nightly lag**; 653's server-confirmed summary sync.
- **591 rest:** driven by 588; `categoryBudgets`, `decisions`, calendar reminders, `feeReviews`, merchant corrections, settings docs. **Not** `financialGoals` (already synced). Explicitly out: Nutrition, Ganesh, duress trees, `meta/*`, shared top-level `splits`/`vaults`/`paymentRequests`.
- **Order:** do 591 only for collections a planned screen migration actually needs (per 588), since every table adds nightly reads (D6).

### Phase 2: foundations

**592: copy authoritative values.** A `financial_summaries` table (the doc jsonb, plus typed keys `kind`, `period`), typed balance and due columns on `accounts`/`credit_card_bills` (R2.2 migration plus mapping), field parity nightly, a **test that no money source computes a display total** (a static guard over `lib/readModel/*Sources.ts`, like `auditNoListener.test.ts`), the "Updating…" behaviour while this device has an unpushed write (reuses `readModelSession` and the freshness badge), and R4 updated in the rules doc.

**593: realtime** (if D2 = realtime). `lib/readModel/realtimeStore.ts`: one channel per uid, started only when some key is in `supabase` mode; resubscribe plus refetch `synced_at > lastSeen`; the overlay is kept until the pushed row arrives; a failure → that key falls back via the existing `readPath` session fallback; never in duress or local-test (the loopback gets a fake emitter for Spendly Test). Tests: store reducer (vitest, `shared/` if pure), fallback, duress. Drill: realtime outage. Measure messages per day.

**594: offline.** Under D1 (b): **no new cache.** Codify "offline ⇒ firestore" per key (already in `effectiveReadModelMode`), and add the constraint to 600 that listeners stay for collections needed offline. Under D1 (a): SQLite (`expo-sqlite`), cleared on sign-out and account deletion, never in duress, size cap; this is a new native dependency, so a new build. Acceptance either way: the airplane-mode drill on every migrated key.

**595: plan and capacity.** Measure egress, connections, messages and DB size; the user decides Free or Pro with a dated cost; if Pro, a restore drill; pause/limit alerting added to `Read-model sync health`; runbook cost watch updated.

### Phase 3: screens (each: new key → firestore default → shadow 7 days → supabase, approved by the user)

| Story | Key(s) | Replaces | Display values from |
|---|---|---|---|
| **596** live Journal + recent activity | `journalLive` | `FinanceDataProvider` newest-window listeners (expenses/incomes) for *this consumer only*; the provider keeps running for the others | rows (lists only); prerequisite: the `journal` key itself flipped to `supabase` under 494 |
| **597** accounts, cards, bills | `accounts`, `cards` | account/bill screens' reads | 592 copies, checked to the paisa |
| **598** investments, EPF, FD, loans, subs | one per module | module providers | 592 copies; live prices stay on the Netlify market functions |
| **599** dashboard, net worth, budgets, STS, goals | `dashboard`, `budgets` | summary reads | 592 copies + overlay; **14-day** shadow |

For every screen story: a source in `lib/readModel/<x>Sources.ts`, a query in **both** `supabaseBackend` and `loopbackBackend` (`lib/readModel/backend.ts`), a shadow comparator, the freshness badge, the overlay plus `locallyRemovedIds`, a perf query in `supabase-readmodel/tests/perf/perf_queries.sql` (p95 < 300 ms at 30K txns), **the new key added to `lib/readModel/outageDrill.test.ts`**, and a test that pins the `firestore`-mode query and asserts that `connect` isn't called. UI review by the user on local Expo web (no web deploy).

### Phase 4: savings and readiness

**600: listeners off.** A per-provider gate: a listener isn't mounted only when **every** consumer key of that collection is in effective `supabase` mode, and the collection isn't in D1's offline-required set. Expect `FinanceDataProvider` (2,098 lines, ~6 listener groups) to be the hardest. It needs a consumer map first (from 588). Measure 7 days before and after per step in the tracker. Test: no listener is mounted in `supabase` mode; fallback remounts the listener once, with no loop.

**601: drills and readiness.** Extend `supabase-readmodel/drills/run_drills.sh` and `lib/readModel/outageDrill.test.ts`: realtime outage, airplane mode, Supabase pause, push outage, nightly-only, **all keys back to `firestore` at once with no release**, and a bad mapping on a money table (a variant of runbook drill D5). Runbook rewrite; readiness review against §1; user sign-off.

---

## 5. Critical path and calendar

```
now ─ 587 draft + D2 spike ─┐
now ─ 588 lab inventory ────┤
~11-07 510 gate passes ─────┤
web deploy (583 live) ──────┴─► 587 sign-off (GO / scoped GO / NO-GO)
                                   ├─► 589 ┐  each: backfill + 14 parity days
                                   ├─► 590 ┤
                                   ├─► 591 ┘
                                   ├─► 592 (14 parity days) ─┐
                                   ├─► 593 ─► 594 ───────────┤
                                   └─► 595 (Pro before 597) ─┤
                     596 (needs 494 journal flip) ─► 7d shadow
                     597 ─► 7d shadow     598 ─► 7d shadow
                                     599 ─► 14d shadow ─► 600 (per step, 7d before/after) ─► 601
```

The waits dominate, not the code: realistically **8–12 weeks** of calendar time after a GO, mostly parity and shadow windows that can overlap.

---

## 6. What I need from the user

1. **Web deploy timing** (to make 583 live), when the Netlify credits allow. I won't trigger it.
2. **D5:** accept lab plus console measurement for 588 instead of production telemetry (or grant an R1.1 exception, or accept a Netlify collector).
3. **Permission to correct the drift** in the epic description and in `READ_MODEL_RULES.md` §2 during 587.
4. Whether 587 should present the **scoped GO** (§3) as an option.

## 7. First action when approved

Create `feature/SPENDLY-586-supabase-first-reads` from `main` → move 587 to In Progress → branch `feature/SPENDLY-587-adr-go-no-go` → write the ADR skeleton and tracker, run the realtime-RLS spike on the drill project → stop for review.
