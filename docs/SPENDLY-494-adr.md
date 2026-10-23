# SPENDLY-494 ADR: hybrid Firebase-write / Supabase-read architecture (Phase 0, SPENDLY-502)

| | |
|---|---|
| Status | **Decided 2026-10-17 by the user: GO, option C (no Blaze), dedicated Supabase project.** See §0 |
| Decision date | **2026-10-17** (pricing verified the same day) |
| Story | [SPENDLY-502](https://kesavach.atlassian.net/browse/SPENDLY-502) (Phase 0) |
| Epic | [SPENDLY-494](https://kesavach.atlassian.net/browse/SPENDLY-494) |
| Supersedes | nothing |
| Inputs | `docs/HYBRID_READ_MODEL_AUDIT_AND_PLAN_2026-10-11.md` (the "audit"); `docs/SPENDLY-415-read-budget.md`; `docs/SPENDLY-416-qa-rollout.md`; `docs/SUPABASE_KEEP_ALIVE.md` |

This ADR records the decisions that SPENDLY-502 lists and the evidence for each.

- Where the evidence is missing, it says so. Nothing here is estimated silently.
- Every decision that belongs to the user is marked **PENDING** until the user signs off in a Jira comment on SPENDLY-502.
- Until then, **no Phase 1+ story starts** (SPENDLY-502 blocks 504, 505 and 506).

## 0. Decision (user, 2026-10-17; schedule amended 2026-10-22)

| # | Decision | User's answer | Note |
|---|---|---|---|
| 1 | Go / no-go | **GO** | Against this ADR's no-go recommendation (§3). Recorded as the user's call |
| 2 | Blaze on `expenseapp-27f94` | **REFUSED: stay on Spark** | |
| 3 | Capture option | **C: scheduled reconciler only** | Follows from 2. Options B and D stay rejected (§4) |
| 4 | Supabase project | **Dedicated Spendly project** (2nd Free project) | The earlier "use the shared project" answer was superseded by this choice |
| 5 | Read identity | Third-party auth + RLS, Netlify broker fallback (§7) | Not changed by the user. See the Blaze note below |
| 6 | Sync schedule (amended 2026-10-22) | **Every 3 hours, changed documents only, plus a full copy nightly** | Replaces "once a day". The app shows the user's own writes immediately (511 overlay). See "Schedule amendment" below |

**What option C changes. This ticket requires these follow-ups, and they are *not* done by this story:**
- **Phase 4 (SPENDLY-514…518) becomes Won't Do.** Current balances, cards, investments and net worth stay on Firestore. Changing the Jira status needs the user's explicit instruction.
- **SPENDLY-506** ("`onDocumentWritten` sync") cannot be built as written without Blaze. It must be re-scoped to "the reconciler is the capture path", which merges it with SPENDLY-509.
- **Freshness SLOs** for Phase 3 screens are revised to **"as of the last sync run"**, shown with a "last synced" label (§8).
- **Read identity without Blaze:** the `role: authenticated` claim can't be set by an `onCreate` function or a blocking function. It must come from a Netlify function at sign-in (§7). Netlify is on the **Free** plan, with a hard 300-credit limit that pauses all sites when exhausted, so its usage must be watched.

**The read-budget constraint on option C. This decides how often sync may run.**
- Without triggers, every reconciler run must **re-read the synced documents from Firestore**, because there is no uniform `updatedAt` to query on (audit §3). Those reads count against the **same 50K/day Spark quota** the app already peaks at ≈ 44K (§2). If the quota is exceeded, the app's own reads fail for the rest of the day.
- With today's data (§10: ≈ 3,770 Wave 1 docs, ≈ 4,500 in total), a full Wave 1 pass costs ≈ 3,800 reads.

| Sync schedule | Extra reads/day | Data age on screen | Verdict |
|---|---|---|---|
| Every hour | ≈ 91,000 | ≤ 1 h | **Not possible**: alone it is ~2× the quota |
| Every 6 h | ≈ 15,000 | ≤ 6 h | Unsafe while daily peaks reach ≈ 44K |
| Once a day (night, IST) | ≈ 3,800 | ≤ 24 h | The 2026-10-17 default. **Superseded on 2026-10-22** |
| **Every 3 h, changed documents only, plus a nightly full copy** | **≈ 8–9K** | **≤ 3 h** for creates and edits; ≤ 24 h for category deletes | **Chosen 2026-10-22.** See below |

- The reconciler must also check its own budget. It stops early and resumes next run once it has used a fixed daily read allowance. It also never runs if the day's usage is already high, where measurable.
- Count-first checks (`count()` aggregation, about 1 read per 1,000 entries) find missing or extra rows cheaply. They cannot detect edits, so edits wait for the full pass.

**Schedule amendment (user, 2026-10-22).** The full re-read above assumed there was no field to query changes by. Making "changed only" work needed a pre-check of `updatedAt`, run read-only in production on 2026-10-22:
- **Coverage is close to zero:** `creditCardBills` 36/36, `expenses` 9/1,369, `categories` 0/2,093, the rest ≈ 0.
- **Creates do have a usable field:** they stamp `createdAt` (a server timestamp).
- **Many updates stamp nothing**, and there are hard deletes in `accounts`, `accountTypes`, `accountTransfers`, `accountEntries` and `categories`.

The design that follows (SPENDLY-506):

| Collection | Each 3-hourly run |
|---|---|
| expenses, categories, incomes, accountPayments, creditCardBills, ledgerEvents | **Changed only**: `createdAt` or `updatedAt` after the last high-water mark (minus a 10-minute overlap). **SPENDLY-571** first stamps `updatedAt` on the expense and category updates that miss it, plus one payment create |
| accounts, accountTypes, accountTransfers, accountEntries | **Full copy every run.** They're small (≈ 220 docs), and this catches balance increments and hard deletes, which leave nothing to query |
| All | **Nightly full copy**: the only pass that tombstones the changed-only collections. It also catches writers that don't stamp (older app versions, scripts) |

- **Cost:** ≈ 550 reads per 3-hourly run and ≈ 3.8K for the nightly run, so **≈ 8–9K reads a day**.
- **Amended 2026-10-23 (user): nightly only.** The 3-hourly schedule was removed.
  - **Measured in production:** about 600 reads per changed-only run (mostly the minimum 1 read per empty query) and 4,030 for the full run, so about 9.1K a day.
  - **Why:** with the app's measured peak near 44K a day, that would exceed the 50K Spark quota, and nothing reads the copy yet.
  - **Now:** about 4.3K a day, and the copy may be up to a day old.
  - **Next:** near-real-time updates come from a server-side push after each save (SPENDLY-583), which must land before any screen is switched to `supabase`. App dual-writes were rejected (the reasons are in SPENDLY-583).
- **The job enforces its own budget:** per run and per day (default 12K). Optionally it also skips when the project's own daily read count is already high, so a peak app day (≈ 44K before 501) can't be pushed over 50K.
- **Why not sync after every write:** it would need Blaze triggers, a per-write Netlify call (credits risk), or app write access to Supabase. All three are out on the free plans.

**Evidence grades used below:**
- **M-prod:** measured in production.
- **M-dev:** measured in a dev or emulator session.
- **E:** estimate or extrapolation.
- **Doc:** an official pricing or product page, fetched on 2026-10-17.
- **Code:** a `file:line` on this branch (base `origin/main` @ `bdc2bd9`).

---

## 1. Context

Spendly writes everything to Firestore, in one project `expenseapp-27f94`. That project serves dev and prod, and there is no staging. The epic proposes adding Supabase Postgres as a **read model** for selected reporting and presentation reads. Firebase Auth and Firestore stay authoritative.

What is true today:

| Fact | Grade | Evidence |
|---|---|---|
| Firebase is on Spark, so no Cloud Functions can be deployed | Code | `functions/src/index.ts:23-30` ("Not deployed: Spark cannot enable `cloudfunctions.googleapis.com`") |
| Blaze was explicitly avoided before, for Ganesh | Code | `docs/ganesh-seva-rbac/KAN-36-financial-dashboard-fund-architecture.md:81` ("Do not enable Blaze…") |
| Native Firestore cache falls back to memory, so every cold start re-reads | Code | `lib/firebase.ts:120-143` (`memory-fallback-native`) |
| Read attribution exists only in `__DEV__` builds. There is no production read telemetry | Code | `app/_layout.tsx:63-67` |
| Supabase is Storage + Edge Functions only, with a publishable key in the client | Code | `lib/supabase.ts:12`; `supabase/` holds only storage SQL, `keep-alive.sql` and `functions/` |
| The Supabase project is Free tier and shared with Ganesh Seva | Code | audit §2.2; `docs/SUPABASE_KEEP_ALIVE.md` |
| Most financial writers bypass `commitMutations` | Code | audit §1.2 (`hooks/useEpfContributions.ts:208`, `providers/BorrowingsReceivablesProvider.tsx:606`, `providers/CreditCardBillsProvider.tsx:320,423,627`) |
| Materialized summaries have open correctness bugs | Jira | SPENDLY-495…499 (all To Do, 2026-10-17) |

## 2. Decision evidence: Firestore read and write volume

| Figure | Value | Grade | Source |
|---|---|---|---|
| Reads per native cold launch | ≈ 885 | **M-dev**: one seeded dev session, not production | `docs/SPENDLY-416-qa-rollout.md:75-83` |
| Of which `categories` read twice (realtime + `ensureCategoryHierarchy`) | 287 + 287 | M-dev | same, and `lib/ensureCategoryHierarchy.ts` (SPENDLY-416 F2) |
| Reads per day, typical | 6,000–10,000 | **E**: 10–15 opens/day assumed | `docs/SPENDLY-415-read-budget.md:58` |
| Pre-epic baseline | ≈ 24,000/day | E | `docs/FIRESTORE_READ_INVENTORY.md` §1/§3 (cited by 415) |
| Spark free quota | 50,000 reads, 20,000 writes, 20,000 deletes per day; 1 GiB stored | Doc | firebase.google.com/pricing; firebase.google.com/docs/firestore/pricing |
| **7-day production reads** (Oct 10–17, 2026) | **159K total ≈ 22.7K/day average; peak ≈ 44K on Oct 11** | **M-prod** | Firebase console → Firestore → Usage, screenshot supplied by the user on 2026-10-17 |
| 7-day production writes | ≈ 1K total ≈ 150/day | M-prod | same |
| 7-day production deletes | ≈ 0 | M-prod | same |
| Production data size (all users) | 24 user trees, ≈ 4,500 documents; Wave 1 ≈ 3,770 docs | M-prod | §10 inventory, 2026-10-17 |

**What this means (updated with production numbers):**
- **The estimate was wrong in the other direction.** Real reads average ≈ 22.7K/day, 2–4× the 6–10K estimate. **The Oct 11 peak (≈ 44K) reached ≈ 88% of the Spark daily read quota (50K).** On Spark, crossing the quota makes reads fail for the rest of the day, so the app would stop loading data. **That is a real availability risk.**
- **The data itself is tiny.** About 4,500 documents across all users, so each document is read ~5 times a day on average. The reads come from the app **re-reading the same small data** on each launch (native cache is memory-only, `lib/firebase.ts:120-143`), not from data volume.
- **Writes are negligible** (~150/day), so change-capture cost (option A) would be trivially inside any free tier.
- **A Supabase read model does not fix this risk soon.** No read moves to Supabase until Phase 3, after a 14-day parity gate (SPENDLY-510). The reads that hit the quota today are launch-time listeners on Firestore; they only go away by changing the app.

**SPENDLY-501 (read quick wins) is now Done on `main` (`eb9bdba`, 2026-10-17)**, but not yet released, so the numbers above do **not** include it.
- It removes the second `categories` read at login (production: 2,090 category docs across 11 users) and the dashboard's duplicate `expenses` listener.
- Its effect will show in the console only after a release. Re-check the Usage tab ~7 days after the next build reaches users.

## 3. Decision 1: go / no-go and the primary goal (PENDING, user)

| Option | Consequence |
|---|---|
| **Go, goal = reporting and analytics** | Proceed to Phase 1 after the blockers in §11. Success is measured by the reporting capability; any read reduction is a by-product |
| Go, goal = read cost | **Not supported by the evidence** (§2). Do 501 instead |
| **No-go** | Close the epic as Won't Do. Keep 495–501 (they matter without Supabase). Phase 1+ stories never start |

**Recommendation (with the production numbers): NO-GO for now.** *The user decided GO on 2026-10-17 (§0); the reasoning is kept for the record.*
- The real problem is read volume near the Spark quota. The read model would not touch that for months, and it adds a second database, a sync pipeline and an auth bridge to protect ~4,500 documents.
- The faster, cheaper fixes stay inside Firestore:
  - release 501;
  - give native a durable cache, so launches stop re-reading everything;
  - bound the remaining full-ledger listeners once 496/497/499 make that safe.
- Relational reporting over ~4,500 documents can also be computed on the client from data the app already loads.
- Revisit this ADR if data grows by an order of magnitude, or if a reporting need appears that the client cannot serve.
- **Rollback:** none needed at this stage. Nothing is built yet.

## 4. Decision 2: change-capture option (PENDING, tied to Blaze)

| Option | Sees every write? | Freshness | Extra Firestore reads | Verdict |
|---|---|---|---|---|
| **A. Blaze + `onDocumentWritten`** on an allowlist of `users/{uid}/{col}/{docId}` | **Yes**: client, outbox, Admin SDK (`epf-cron`, scripts), `recursiveDelete` | seconds | ≈ 0 (the event carries the document) | **Recommended if go** |
| B. Change journal inside `commitMutations` | **No**: most writers bypass it (audit §1.2) | minutes | 1–2 per change | **Rejected**: it would need ~40 writers centralized first. That is a large refactor of financial write paths, done only to feed a read model |
| **C. Scheduled paged reconciler only** (GitHub Actions → Netlify) | Yes, eventually | hours | A full or `updateTime`-paged read of every synced document per run. Could approach today's daily reads | **Fallback** if Blaze is refused. It also serves as A's reconciler |
| D. Client dual-write to Supabase | No: misses server writes and offline replays | — | — | **Rejected**: it creates a second write path and a second source of truth, which the epic forbids |

**Consequences:**
- **A** needs a billing account on `expenseapp-27f94`. Today that project serves both dev and prod, and is also used by Ganesh Seva and a sibling Vite app.
- **C** means:
  - hours of lag;
  - Phase 4 (current-balance reads, SPENDLY-514…518) is closed as Won't Do;
  - the freshness SLOs in §8 are revised to "hours";
  - the reconciler's own reads count against the Spark quota.

  The SPENDLY-502 ticket requires this follow-up. It is **not** done by this story; the user decides it after sign-off.

**Rollback:**
- A: undeploy the trigger. Firestore is untouched.
- C: disable the workflow.

## 5. Decision 3: the Blaze plan (PENDING, user)

**Statement for sign-off:** *"The user DOES NOT approve upgrading `expenseapp-27f94` to Blaze for SPENDLY-494."* Status: **DECIDED 2026-10-17 (refused).**

**Evidence:**
- **What Blaze keeps (Doc):**
  - "No-cost usage from Spark plan included" on Blaze.
  - Cloud Functions on Blaze have no cost up to **2M invocations/month** (then **$0.40/million**), **400K GB-seconds/month**, **200K CPU-seconds/month**, and **5 GB/month** outbound (then **$0.12/GB**).
  - Source: firebase.google.com/pricing, fetched 2026-10-17.
- **Bound on today's volume, an estimate (E) with the assumption stated:**
  - On Spark, today's traffic can't exceed 20,000 writes + 20,000 deletes per day. Each fires at most one `onDocumentWritten` invocation, so **today's** volume is at most ≈ 1.2M invocations/month, which is **60% of the free invocation tier**. That covers all collections, not just the allowlist.
  - **This bound disappears on Blaze.** Blaze does not enforce the Spark daily caps, so growth or a runaway write loop is billed rather than refused. The real figure must come from the 7-day usage export (§13).
  - GB-seconds and CPU-seconds depend on function memory and duration. These must be checked against measured runs in Phase 1. They are not asserted here.
- **Firestore per-operation prices above the free quota: NOT VERIFIED.**
  - The Google Cloud pricing page did not return per-region rates when fetched.
  - The user, or the next session, must read the rate for the database's region from cloud.google.com/firestore/pricing before signing.
  - Today's estimated volume is inside the free quota (§2), so the expected Firestore charge is zero. But Blaze removes Spark's hard stop: a runaway loop would bill instead of being refused.
- **Required guardrail if Blaze is approved:** a Cloud Billing budget with alert thresholds on day one. Note that budget alerts *notify*; whether they cap spend must be confirmed in the Google Cloud billing docs before relying on them.
- **Conflict to resolve:** `docs/ganesh-seva-rbac/KAN-36-financial-dashboard-fund-architecture.md:81` says "Do not enable Blaze". That was scoped to KAN-36, but the project is shared. The user's decision here supersedes it for this project, and should be noted there if Blaze is approved.

## 6. Decision 4: Supabase project (PENDING, user; recommended: dedicated)

| Option | For | Against |
|---|---|---|
| **Dedicated Spendly project** | Separates the service-role key's blast radius from Ganesh; separate pause and keep-alive behaviour; separate 500 MB budget | Uses the second of the **2 active Free projects** (Doc: supabase.com/pricing). Whether the account already has a second project is **UNKNOWN**: verify in the dashboard |
| Shared `ganesh-seva-storage` | No new project | Ganesh's service role could read Spendly finance data; a shared 500 MB limit; a shared pause risk; it couples two products, against the multi-app safety rule |

**Free-plan facts (Doc, supabase.com/pricing, 2026-10-17):**
- 2 active projects;
- 500 MB database;
- 5 GB egress;
- 50,000 MAU;
- **paused after 1 week of inactivity**;
- **backups not included**.

Pro costs **from $25/month**, with 8 GB disk and 7-day backups.

The read model is rebuildable from Firestore (SPENDLY-509 backfill), so the lack of backups is acceptable on Free. A pause is handled by the Firestore fallback (§8).

**Sizing (measured, §10):** ≈ 4,500 documents in total, so 500 MB is not a constraint.

**User answer (2026-10-17):** the account has **one** Supabase project, and the user prefers to **use the existing shared project** rather than create a second. If the decision is ever go, this ADR still recommends a dedicated project, for the service-role blast radius. That choice only matters on a go.

**Rollback:** drop the project. Nothing in Firestore changes.

## 7. Decision 5: read identity (recommended: third-party auth + RLS, broker fallback)

| Option | Mechanism | Evidence / constraint |
|---|---|---|
| **1. Supabase third-party auth (Firebase)** | The app sends its Firebase ID token. RLS policies check `auth.jwt()->>'sub' = uid` plus `iss = https://securetoken.google.com/expenseapp-27f94` and `aud = expenseapp-27f94` | Doc (supabase.com/docs/guides/auth/third-party/firebase-auth): **every Firebase user needs a `role: 'authenticated'` custom claim**, otherwise they get the `anon` role. Ways to set it: a blocking function (needs **Identity Platform**), or Admin SDK `setCustomUserClaims` plus an `onCreate` function (**needs Blaze**). Without Blaze, a Netlify function can set the claim at sign-in, followed by a forced token refresh. The first token lacks the claim either way. Third-party MAU: 50,000 included on Free and Pro, then $0.00325/MAU |
| 2. Netlify read broker | `verifyIdToken(checkRevoked)` → a service-role query filtered by the verified uid | Proven in the repo (`netlify/functions/delete-account.ts`). Netlify Free is **300 credits/month**, and compute is **10 credits per GB-hour**. **When credits run out, all sites are paused** (Doc, Netlify credits docs). That is a real risk for a per-read broker on the same account that hosts the web app |
| 3. Edge-function Firestore-REST bridge | The existing `spendly-files` pattern | Costs one Firestore read per request and has no `aud` check (audit §2.2). **Rejected** |

**Choice:** spike option 1 in SPENDLY-505; fall back to option 2. These are non-negotiable in every case:
- RLS is enabled with **default deny** on every table;
- `anon` gets **no grants**;
- the **service-role key never ships in the app**: it lives only in the trigger, reconciler and Edge Function environments, and `storageSecurity.test.ts` is extended to scan for it;
- cross-user denial tests run against local Supabase.

**Rollback:** the kill switch sends reads back to Firestore (§8).

## 8. Decision 6: freshness SLOs and the kill switch

| Screen group | SLO (option A) | SLO (option C, amended 2026-10-22) |
|---|---|---|
| Journal history, reports and export (Phase 3) | ≤ 60 s | **≤ 3 h** for creates and edits, **plus the user's own writes shown immediately** (overlay). Shown as "last synced HH:MM" |
| Insights and range analytics (Phase 3) | ≤ 5 min | same as above |
| Current balances, cards, net worth (Phase 4) | ≤ 10 s **plus an overlay of the user's own pending writes** | **not offered**: Phase 4 is cancelled |

**Exceptions to the 3 hours under option C:**
- **Category hard deletes:** ≤ 24 h, because only the nightly full copy can see them.
- **Edits from writers that don't stamp `updatedAt`** (app versions older than SPENDLY-571, admin scripts): ≤ 24 h.
- **GitHub schedule delay:** scheduled runs can start late. GitHub also disables schedules after 60 days without repo activity, so SPENDLY-507 alerts on a missing run.

A screen whose lag passes its bound falls back to Firestore (below). The "last synced" label reads the user's own `sync_status` rows (SPENDLY-505 policy).

**Kill switch:** `system_settings/global.readModel.<screen>`, with the values `firestore | shadow | supabase`.
- It is remote, per screen, and needs no app release.
- Clients can only read it; the rules deny client writes. That is verified when SPENDLY-511 adds the field.
- When lag exceeds the SLO, or Supabase is paused or unreachable, the screen falls back to its retained, bounded Firestore query.
- A stale value is never shown as current (audit §4.8).

## 9. Decision 7: ownership of numbers and data conventions

**Ownership rule:**
- Firestore materialized values are authoritative: `accounts.currentBalance`, `currentOutstanding`, `financialSummaries/epf`. That holds only **after** 495–499 and the 500 reconciliation are done.
- Supabase **copies** them for display.
- SQL recomputation exists **only for reconciliation**.
- `financialSummaries/netWorth` and `/investments` are never synced as truth (audit §4.1.5).
- Reporting aggregates that exist only in Supabase are golden-tested against the TypeScript reference in `shared/utils/*`.
- No number shown to the user ever has two owners.

**Conventions:**

| Topic | Convention | Evidence |
|---|---|---|
| Currency | `expenses`/`incomes` carry **no currency field**. Amounts are in the user's currency setting, which defaults to INR. Read-model column: `numeric(18,2)`, with no conversion | `shared/types/settings.ts:78,235` |
| Month bucketing | `YYYY-MM` from the row's `month` field, else the `date` prefix. Timezone-neutral, and identical to the TypeScript helper | `shared/utils/dates.ts:42-58` (`monthFromDateKey`, `monthKeyOf`) |
| Timestamps | Source types are mixed: Firestore `Timestamp`, ISO strings, epoch ms. They are normalized to `timestamptz` by a pure mapper in `shared/utils/readModel/`, with vitest tests (SPENDLY-504/506). The version guard is the Firestore document `updateTime` | audit §4.3–4.4 |
| Soft deletes | `deletedAt`, `voidedAt`, `CANCELLED` and `archived` map to columns. Views filter them the same way `isActiveLedgerRow` does | audit §4.4 |
| Unmappable shapes | Stored raw in `doc jsonb`, flagged `mapping_status='unmapped'`. **Never dropped** | audit §4.3 |

## 10. Decision 8: collection waves, exclusions and legacy inventory

**Waves (from the epic):**
- **Wave 1:** `expenses`, `incomes`, `ledgerEvents`, `accounts`, `accountTypes`, `accountTransfers`, `accountEntries`, `accountPayments`, `creditCardBills`, `categories`.
- **Wave 2:** `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments`, `subscriptions`.
- **Wave 3:** `investments`, `holdings`, `portfolioTransactions`, `investmentCashTransactions`, `portfolioSettings`, `epf*`.

**Always excluded:**
- `users/{uid}_duress/**`;
- `meta/*`, `stats`, `notifications`;
- `financialSummaries` (as truth);
- Nutrition and Ganesh data;
- top-level `splits`, `vaults`, `paymentRequests`.

**Inventory tool:** `scripts/inventory-user-collections.js`. It runs `listCollections()` per user, like `netlify/functions/delete-account.ts:281`.
- Read-only. The output is aggregates only: no uids, document ids or field values.
- Duress trees are counted but never opened.
- It refuses a production target without `--production`, and refuses a non-local emulator.
- Unit tests: `scripts/inventoryUserCollections.test.ts` (11 tests).

**Results:**

| Run | Status | Result |
|---|---|---|
| Emulator, seeded `demo-spendly` (2026-10-17) | **Done** (M-dev) | 1 user, 0 duress. Present: wave 1 `accounts`, `accountTypes`, `expenses`, `incomes`; wave 2 `subscriptions`; wave 3 `holdings`, `portfolioSettings`; excluded `financialSummaries`; unassigned `categoryBudgets`, `financialGoals`. **This only proves the tool works.** The seed is synthetic and says nothing about production |
| Production (`--production --doc-counts`), 2026-10-17, approved by the user | **Done** (M-prod) | **24 user trees, 0 duress trees, ≈ 4,500 documents.** Wave 1 ≈ 3,770 docs (`categories` 2,090 across 11 users; `expenses` 1,352 across 12; `accountEntries` 142; `incomes` 44; `creditCardBills` 34; `accountTransfers` 27; `accounts` 26; `accountTypes` 22; `accountPayments` 19; `ledgerEvents` 17). Wave 2: `subscriptions` 22, `borrowings` 3; `borrowingRepayments`, `receivables` and `receivableRepayments` exist for no user. Wave 3 ≈ 110 docs (EPF, holdings, portfolio). Excluded: `meta` 322, `financialSummaries` 84, `stats` 23, `notifications` 3. Unassigned/legacy: `portfolioSnapshots` 129, `creditCardBillReminderLogs` 83, `daily_logs` 7, `focus` 1, `goals` 1, `profile` 1, `weight_history` 1, `pandalMemberships` 4, and a few single docs. **The whole read model would fit in well under 1% of Supabase Free's 500 MB** |

**Collections the rules allow that are in no wave yet** (`firestore.rules` `users/{uid}` matches and the catch-all at `:980-990`): `categoryBudgets`, `financialGoals`, `goalFundingPlans`, `sipPlans`, `sipTransactions`, `trips`, `spaces`, `decisions`, `whatIfScenarios`, `runwaySettings`, `merchantOverrides`, `feeReviews`, `focus`, `goals`, `profile`, `daily_logs`, `weight_history`, and others. **Decision:** they stay out of the read model until a later story assigns them a wave. `daily_logs` and `weight_history` are presumed Nutrition and excluded; confirm with the production inventory.

## 11. Blockers that stay outside this epic

The SPENDLY-494 description says these block it. Their status in Jira on 2026-10-17:

| Key | Summary | Status | Blocks |
|---|---|---|---|
| SPENDLY-495 | Dashboard period summaries (`categoryTotals`) | To Do | 500, 510, 518 |
| SPENDLY-496 | Balance-moving writes skip materialized updates | To Do | 500, 510, 514, 515 |
| SPENDLY-497 | Credit-card materialized drift | To Do | 500, 510, 516 |
| SPENDLY-498 | Holding adjustments never committed (P0 silent data loss) | To Do | 514, 517 |
| SPENDLY-499 | Consolidate the summary rebuilds | To Do | 500, 503, 510, 518 |
| SPENDLY-500 | Production reconciliation (436 apply, HDFC) | To Do | 503, 515, 516 |
| SPENDLY-501 | Read quick wins | **Done** on `main` (`eb9bdba`), not yet released | relates to 502 |

These matter **with or without** Supabase. A no-go keeps all of them.

## 12. Decisions requiring the user (sign-off checklist)

Copy this into the Jira sign-off comment on SPENDLY-502 and fill it in:

```
SPENDLY-494 ADR sign-off (date: ____)
1. Go / No-go: ____        Primary goal: reporting | reads
2. Blaze on expenseapp-27f94: APPROVED | REFUSED
3. Capture: A (trigger + reconciler) | C (reconciler only)
4. Supabase project: dedicated | shared ganesh-seva-storage
5. Read identity: third-party auth + RLS (broker fallback) — agree | change: ____
6. Production inventory (read-only) run and reviewed: yes | no
```

**What follows from each answer:**
- **No-go:** close the epic as Won't Do and keep 495–501. The agent does **not** change statuses itself.
- **Go + C:** Phase 4 (514…518) goes to Won't Do and the §8 SLOs are revised, by the user or on their explicit instruction.
- **Go + A:** Phase 1 (504, 505, 506) may start **one story at a time**, each with approval.

## 13. Evidence status (2026-10-17)

| Item | Status | Result |
|---|---|---|
| 7-day Firebase usage | **Collected** (user screenshot) | §2: ≈ 159K reads, ≈ 1K writes, ≈ 0 deletes; peak ≈ 44K reads/day |
| Production inventory | **Run** with user approval (read-only, aggregates only) | §10: 24 user trees, ≈ 4,500 docs, 0 duress trees |
| Supabase account | **Answered** | One project (`ganesh-seva-storage`). The user prefers to use it rather than create a second one |
| Netlify plan | **Answered** | Free (300 credits/month, hard limit; all sites pause when exhausted) |
| Firestore per-region operation prices | **Not retrieved** | Only needed if the user chooses Blaze |

## 14. Pricing sources (fetched 2026-10-17)

| Service | Figures used | Source |
|---|---|---|
| Firebase / Cloud Functions | Spark: 50K reads, 20K writes, 20K deletes per day, 1 GiB. Blaze functions: 2M invocations/month free then $0.40/M, 400K GB-s, 200K CPU-s, 5 GB egress then $0.12/GB. Spark no-cost usage is included in Blaze | https://firebase.google.com/pricing ; https://firebase.google.com/docs/firestore/pricing ("exactly one free database per project") |
| Firestore per-operation | **not retrieved** | https://cloud.google.com/firestore/pricing |
| Supabase | Free: 2 projects, 500 MB, 5 GB egress, 50K MAU, paused after 1 week, no backups. Pro from $25/month, 8 GB, 7-day backups. Third-party MAU: 50K included, then $0.00325 | https://supabase.com/pricing ; https://supabase.com/docs/guides/auth/third-party/firebase-auth |
| Netlify | Free: 300 credits/month, hard limit; compute 10 credits/GB-hour; production deploy 15 credits; all sites paused when credits run out. Personal plan $9/month | https://www.netlify.com/pricing/ ; https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/ |
| GitHub Actions | Free for public repositories on standard hosted runners (this repo is **public**, per `gh repo view`) | https://docs.github.com/en/billing/concepts/product-billing/github-actions |

Prices change. Re-verify them on the actual sign-off date if it is more than ~30 days after 2026-10-17.
