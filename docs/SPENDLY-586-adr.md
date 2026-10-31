# SPENDLY-586 ADR — Supabase-first reads: go/no-go

| | |
|---|---|
| Story | SPENDLY-587 (epic SPENDLY-586) |
| Status | **Draft, awaiting user sign-off.** Every decision is marked RECOMMENDED until the user signs off in a Jira comment on SPENDLY-587 |
| Drafted | 2026-10-31 on `feature/SPENDLY-587-adr-go-no-go` (from `main` `ac108974`) |
| Pricing verified | 2026-10-31 (supabase.com/pricing, supabase.com/docs/guides/realtime/limits, firebase.google.com/docs/firestore/pricing) |
| Predecessor | `docs/SPENDLY-494-adr.md` (hybrid read model, option C, no Blaze) |
| Plan | `docs/SPENDLY-586-plan.md` |

Evidence grades follow the 494 ADR: **M-prod** = measured in production, **M-dev** = measured on a dev/emulator session, **Doc** = vendor documentation, **Code** = read from the repository, **E** = estimate.

---

## 0. Summary

**Recommendation: HOLD Phase 1+, then decide with two numbers that don't exist yet.** The epic's main motive (Firestore reads) has to be re-measured after SPENDLY-633, which is shipping in the Expense release triggered on 2026-10-31. Its biggest technical unknown, realtime under Firebase-issued tokens, has to be proven by a spike.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Offline | **(b) Firestore's persistent cache stays the offline source.** No SQLite cache of our own |
| D2 | Realtime | **Broadcast "ping + refetch"** on a private per-user topic, not `postgres_changes`. Must pass the spike (§3.3) first |
| D3 | Number ownership | **Copy where Firestore materializes (balances, card dues, EPF, dashboard periods); compute with the existing TypeScript helper where it doesn't (net worth, safe-to-spend, budgets).** Never SQL |
| D4 | Supabase plan | **Free until a money screen flips to `supabase`; Pro ($25/month) before that** (597) |
| D5 | Success metric | **Firestore reads per day (7-day console average)**: re-baselined after 633, then a target of at least a 30% cut attributable to 600 |
| D6 | Net read budget | Not a blocker: the data is tiny. Track the full-run headroom (4,106 of 6,000) |
| D7 | Go/no-go | **Scoped GO** (live Journal plus accounts/cards lists) **only if** the spike passes and the post-633 baseline is ≥ 15K reads/day. Otherwise **NO-GO**, keeping the six read-path screens |

---

## 1. Context and evidence

### 1.1 Preconditions (2026-10-31)

| Item | Value | Grade | Source |
|---|---|---|---|
| Parity gate (SPENDLY-510) | **7 of 14** clean days, 0 open failures | M-prod | Health run `41153306559`, 2026-10-31 01:02 UTC |
| Per-write push (SPENDLY-583) | **Live as of 2026-10-31.** Web deploy `41178735321` succeeded. `readmodel-push` and `readmodel-claims` answer 401 to an unauthenticated POST (before this deploy they returned 404) | M-prod | curl probe, 2026-10-31 |
| Expense release with SPENDLY-633 | Triggered 2026-10-31, run `41178732722` | — | GitHub Actions |

### 1.2 Read volume

| Figure | Value | Grade | Source |
|---|---|---|---|
| App reads, 7-day average (Oct 10–17) | ≈ 22.7K/day, peak ≈ 44K | M-prod | 494 ADR §2 (console screenshot) |
| Epic's figure | ≈ 18K/day of app use, plus ≈ 4.3K sync | E | SPENDLY-586 description (2026-10-23), after 501's quick wins |
| Nightly sync | **4,106** (full) + **312** (verify) = **≈ 4.4K/day**, flat for 3 nights | M-prod | Health run `41153306559`, `sync_runs` table |
| Full-run budget | 6,000 per run, 12,000 per day | Code | `docs/READMODEL_RUNBOOK.md` cost watch |
| Spark quota | 50,000 reads/day | Doc | firebase.google.com/pricing |

**Why the baseline must be re-measured (633).** Until SPENDLY-633 the native Firestore cache was memory-only, so every cold launch re-read every listened collection. 633 (on `main` `ac108974`, shipping now) makes it durable. Firestore pricing says a listener that reconnects with persistence enabled is billed only for changes, **unless it was disconnected for more than 30 minutes**: "you will be charged … as if you had issued a brand-new query" (Doc, firebase.google.com/docs/firestore/pricing). So 633 saves reads for relaunches within 30 minutes, and gives **no** saving for a launch after a longer gap. That is the common pattern for a finance app, which is opened a few times a day. **The real effect is unknown until measured.** It could be anywhere from small to large.

### 1.3 Data size

From the 494 production inventory (M-prod, 2026-10-17): 24 user trees, ≈ 4,500 documents. The candidates for this epic are tiny: Wave 2 ≈ 25 docs (`subscriptions` 22, `borrowings` 3), Wave 3 ≈ 110, `financialSummaries` 84. The whole read model stays well under 1% of Free's 500 MB.

### 1.4 Coverage today (Code)

12 synced collections (`shared/utils/readModel/mapping.ts`): the 10 Wave 1 collections plus `financialGoals` and `goalEvents` (SPENDLY-609). There are 6 read-path screen keys (`shared/utils/readModelMode.ts`): `journal`, `insights`, `cashFlow`, `audit`, `cashback`, `goals`. **None is flipped:** the 14-day gate hasn't passed.

---

## 2. D1 — Offline

**Options**
- (a) A persistent on-device cache of read-model rows (SQLite), refreshed by realtime and on launch.
- (b) Firestore's persistent cache stays the offline source. When offline, a screen reads Firestore, which is what `effectiveReadModelMode` already does (`!online → firestore`, `shared/utils/readModelMode.ts`).
- (c) No offline reads for migrated screens.

**Evidence**
- Firestore persistence is now durable on **both** platforms: web uses IndexedDB `persistentLocalCache` (`lib/firebase.ts:11`), and native uses the RNFB 24 durable cache (SPENDLY-633). (Code)
- Offline writes already go through the outbox (`commitMutations`), and their pending state is in the Firestore cache. A second cache would need its own overlay of those pending writes. (Code)
- (a) adds a native dependency (`expo-sqlite`), schema migrations on device, encryption at rest, clear on sign-out and account deletion, and a duress exclusion: **a second local store of financial data.** (E)

**Recommendation: (b).**

**Consequence (binding on 600):** a Firestore listener can't be removed for a collection that a screen must show offline, because without the listener the cache goes stale. 600 therefore saves reads only for collections that aren't needed offline, or it accepts showing data as of the last online session. The user must accept one of these in 600. If neither is acceptable, (a) is reopened for that collection alone.

**Rollback:** none needed. (b) is today's behaviour.

## 3. D2 — Realtime

### 3.1 Options
- (a) `postgres_changes` on each table, filtered by RLS.
- (b) **Broadcast from the database:** an `AFTER INSERT OR UPDATE` trigger sends a **ping** (`{table, doc_id, synced_at}`, no document data) to the private topic `user:<uid>`. The client refetches the changed rows through PostgREST, where RLS applies as usual.
- (c) Polling `sync_status` / `max(synced_at)` every N seconds while a migrated screen is open.

### 3.2 Evidence
- **Tombstones are invisible to (a).** Every owner policy is `using (uid = readmodel_auth.uid() and not source_deleted)` (`20261022000000_readmodel_read_policies.sql:63`). A soft delete is an UPDATE whose new row fails that policy, so the subscriber is never told. Deletes in Spendly are soft (R1.3), so (a) would leave deleted rows on screen until a reload. (Code)
- **(a) does per-subscriber RLS checks on a single thread:** "a single change to a table with 100 subscribed users … 100 authorization checks", and "Changes are also processed on a single thread". Supabase calls Broadcast "the recommended method for scalability and security". (Doc)
- (b) needs `realtime.messages` RLS (Realtime Authorization), `private: true` channels and `supabase.realtime.setAuth()`. (Doc)
- **Third-party auth:** Supabase states that third-party tokens can access "Realtime" (Doc). It doesn't say whether `auth.jwt()` inside a `realtime.messages` policy carries the Firebase claims that `readmodel_auth.uid()` checks (`iss`, `aud`, `role`, `exp`, `sub`, the duress suffix). **Unproven, so it needs the spike.**
- **Version guard:** the sync's upsert rewrites a row only when `excluded.source_update_time > t.source_update_time or t.source_deleted` (`20261023000000_readmodel_sync.sql:69-72`). So a trigger fires only on real changes, never nightly for every row. (Code)
- **Limits:** Free allows 200 concurrent connections, 2M messages/month and 100 messages/s; Pro allows 500 connections, 5M messages and 500/s (Doc, 2026-10-31). Volume: ≈ 150 writes/day in production (494 ADR §2), times devices per user, which is orders of magnitude inside either plan. (E)
- **Token expiry:** Firebase ID tokens last an hour. The channel must be re-authorized (`setAuth`) on each token refresh, through the same token source `lib/readModelClient.ts` uses today. (Code/E)

### 3.3 The spike (blocks D7)
Goal: prove (b) under third-party auth before any Phase 1 work.
1. A throwaway table `spike_rt` (contract-like: `uid`, `doc_id`, `source_deleted`, `synced_at`), a trigger calling `realtime.send`/`broadcast_changes` to `user:<uid>`, and a `realtime.messages` SELECT policy `realtime.topic() = 'user:' || readmodel_auth.uid()`.
2. Subscribe as user A with a Firebase emulator–shaped token. Write rows for A and for B. **A must receive only A's pings; a duress-suffixed token and an expired token must receive nothing.** Soft-delete one of A's rows: A gets a ping, the refetch omits the row.
3. Measure the ping latency (target < 2 s from upsert) and the re-auth after token refresh.

**Where it can run (needs a user decision):** Docker isn't installed on the dev machine (2026-10-31), so `supabase start` (local Realtime) isn't available, and the 520 drill harness is Postgres + PostgREST without Realtime. Options:
- (i) install Docker Desktop and run it locally;
- (ii) run it in the live read-model project in an isolated `spike` schema, dropped afterwards. This is a production change, so it needs a dry run and approval (R7.3), and the project accepts only real Firebase tokens, so it would need a test Firebase user;
- (iii) a second, temporary free Supabase project. The user preferred a single project on 2026-10-17.

**Recommended: (i).**

### 3.4 Recommendation
**(b) Broadcast ping + refetch.** (a) is rejected for the tombstone gap. (c) is the fallback if the spike fails. If even (c) is rejected, D7 becomes NO-GO for live screens (596–599).

**Rollback:** a screen's key back to `firestore`; dropping the trigger stops all pings.

## 4. D3 — Number ownership

**Evidence (Code, and the 494 audit §4)**

| Value | Firestore owner | Materialized? |
|---|---|---|
| Account balance, card outstanding | `accounts.currentBalance`, `currentOutstanding` | **Yes** (repaired to zero variance, 495–567, 584/602/603) |
| EPF summary | `financialSummaries/epf` (server-confirmed sync, SPENDLY-653) | **Yes** |
| Dashboard period tiles | `financialSummaries/dashboard_*` (`DashboardPeriodSummary`, `lib/summaryMonthStore.ts`) | **Yes** |
| Net worth | `composeNetWorth` (`shared/utils/netWorth.ts:130`), called by `hooks/useUnifiedNetWorth.ts`; needs holdings, FD and **live quotes** | **No.** `financialSummaries/netWorth` and `/investments` are "written, never read" and inaccurate (audit P1-2), so they're never synced as truth |
| Safe-to-spend, budgets | computed client-side from rows and settings | **No** |

**Recommendation.** "One owner" means **one computation over one source of inputs**:
1. Where Firestore materializes a value, the read model **copies** it (592) and the screen shows the copy.
2. Where Firestore doesn't (net worth, safe-to-spend, budget progress), the screen keeps the **existing TypeScript helper**, fed with read-model rows (R3.6). It's the same code with the same inputs, so there's no second owner.
3. **SQL never computes a displayed number** (R4.2). 592 adds a static guard test over `lib/readModel/*Sources.ts`.
4. `financialSummaries/netWorth` and `/investments` stay out of the read model.

**Drift this exposes:** 599 says net worth comes "from the copied authoritative summaries". That's impossible, because no authoritative net-worth document exists. 599 must use rule 2.

## 5. D4 — Supabase plan

| | Free | Pro |
|---|---|---|
| Price | $0 | from $25/month (includes $10 compute credit, Micro) |
| Database | 500 MB | 8 GB, then $0.125/GB |
| Egress | 5 GB | 250 GB, then $0.09/GB |
| Realtime | 200 connections, 2M messages/month | 500 connections, 5M messages |
| Pausing | "paused after 1 week of inactivity" | never |
| Backups | none | daily, 7 days |

(Doc, supabase.com/pricing, 2026-10-31)

**Recommendation:**
- **Free through Phases 0–2 and the shadow periods.** A copy is rebuildable (drill D1), the nightly sync counts as activity, and in `shadow` the user is always served Firestore.
- **Pro before the first money screen flips to `supabase` (597).** At that point a pause takes the screen to its fallback for every user, and a rebuild costs a full Firestore read.
- **Cost:** $25/month (E: usage is far inside every Pro limit).
- **The user decides in 595.**

## 6. D5 — Success metric and the read inventory (588)

**Metric:** Firestore reads per day, the 7-day average from the Firebase console (Firestore → Usage), as in the 494 ADR §2.

**Baseline:** the 7 days that start once the 633 release has reached the user's devices (the console export is supplied by the user).

**Target:** 600 cuts the post-633 baseline by **≥ 30%**, measured 7 days before and after each listener removal. Below 15K/day there is no quota risk worth this epic's complexity (it's under 30% of Spark).

**588 method (proposed; differs from Jira):**
- **Lab:** a scripted cold launch and steady state on Spendly Test, with `lib/firestoreReadDebug.ts` counters per feature. This gives the per-listener ranking.
- **Production:** the console total from the user's export.

**Not** production per-screen telemetry. The app may not write to Supabase (R1.1), there is no analytics vendor (`lib/shortcutTelemetry.ts` is console-only), and a Netlify collector costs credits. Jira asks for "one week of production data", so the user must accept this change.

## 7. D6 — Net read budget

- Adding Wave 2, Wave 3, `financialSummaries` and the 591 candidates adds ≈ 250–500 documents (M-prod counts, §1.3). That is ≈ +10% on the nightly full run: ≈ 4.5K of the 6K full-run budget.
- Realtime and the refetch cost no Firestore reads. Push reads 1 doc per write: ≈ 150/day.
- **Conclusion:** the read model's own cost doesn't block the epic. Headroom on the full run is ≈ 30% and shrinks with user growth; the health summary already reports `reads_used`.

## 8. D7 — Go/no-go

**The user's goal (2026-10-23):** every screen reads Supabase.

**Costs found here:**
- realtime needs a new mechanism (D2) whose auth is unproven;
- offline stays on Firestore, which caps how many listeners can go (D1);
- net worth, safe-to-spend and budgets can't be "copied" (D3);
- Pro becomes necessary ($25/month, D4);
- the read savings are unmeasured after 633 (D5).

**Recommendation:**
1. **Now:** HOLD. Merge this ADR, do 588 (the lab inventory), and run the spike.
2. **Decision point, the later of:** the parity gate passing (≈ 2026-11-07), the spike result, and the post-633 7-day baseline.
3. **If** the spike passes **and** the baseline is ≥ 15K/day: **scoped GO.**
   - 589 only if 598 is in scope; 592, 593, 594 (as D1 (b)) and 595;
   - **596 (live Journal) and 597 (accounts/cards lists)**, then 600 for those collections;
   - **checkpoint:** 598/599 continue only if 600 shows ≥ 30%.
4. **Otherwise: NO-GO.**
   - 589–601 become Won't Do, by the user's instruction.
   - The six read-path screens from 494/611 continue on their runbook.
   - 588's inventory still guides plain Firestore read fixes (like SPENDLY-501), which attack the quota directly.

**Rollback at any stage:** each screen key back to `firestore` in `system_settings/global.readModel`, with no release (R3.9). Dropping the realtime trigger stops pings.

## 9. Sign-off checklist (user)

- [ ] D1 offline (b), and its consequence for 600
- [ ] D2 Broadcast ping + refetch; where the spike runs: (i) Docker / (ii) prod `spike` schema / (iii) temp project
- [ ] D3 ownership rule, and the 599 correction
- [ ] D4 Free now, Pro before 597
- [ ] D5 metric and 588 lab + console method (instead of production telemetry)
- [ ] D7 HOLD → decision point → scoped GO / NO-GO
