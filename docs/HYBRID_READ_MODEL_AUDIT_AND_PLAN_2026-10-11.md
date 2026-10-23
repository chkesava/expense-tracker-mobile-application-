# Hybrid Firebase-write / Supabase-read architecture: audit and plan (2026-10-11)

This document plans the work; nothing in it has been implemented. It covers the repository audit, the target architecture, the phased plan and the Jira mapping for introducing Supabase Postgres as a **synchronized read model** while Firebase Auth and Firestore stay authoritative.

- Audited on `main` @ `36590e3`.
- No code was changed.
- No production data was read or written.
- Jira keys are listed in §9.

> Rule for every claim: it is backed by a file:line in the repo or by a Jira issue. Anything not established is marked **UNKNOWN** with how to verify it.

---

## 1. Executive summary

1. **The "~120 Firestore reads/day" premise is contradicted by the repo.**
   - SPENDLY-416 measured **~885 server reads per native cold launch** (`docs/SPENDLY-416-qa-rollout.md:75-83`).
   - SPENDLY-415 estimates **~6,000–10,000 reads/day** (`docs/SPENDLY-415-read-budget.md:58`).
   - Native Firestore persistence is memory-only (`lib/firebase.ts:7-16,131-143`), so every cold start re-reads from the server.
   - No production read telemetry exists. `spendlyReadStats()` is dev-only (`app/_layout.tsx:62-67`).
   - Even the higher estimate is inside the Spark free quota.
   - **Cost is therefore not a justification for Supabase.** Relational reporting and analytics may be one. The go/no-go story decides this explicitly.
2. **Change capture without triggers is incomplete.**
   - Firebase is on **Spark**: Cloud Functions cannot be deployed (`functions/src/index.ts:23-30`, `docs/EPF.md:182`).
   - **Most financial writers bypass `commitMutations`**: EPF, portfolio/holdings, SIP, investments, borrowings/receivables, most credit-card-bill writes, subscriptions, categories, splits. Examples: `hooks/useEpfContributions.ts:208`, `providers/BorrowingsReceivablesProvider.tsx:606`, `providers/CreditCardBillsProvider.tsx:320,423,627`.
   - The Admin SDK also writes: `netlify/functions/epf-cron.ts`, and `delete-account.ts`'s `recursiveDelete`.
   - There is **no uniform `updatedAt`** and **no delete tombstone** on most collections.
   - Only a Firestore `onDocumentWritten` trigger (which needs **Blaze**) sees every create, update and delete.
3. **Firestore's own materialized state has verified correctness defects.** Copying it into Supabase, or recomputing it there, would produce numbers that disagree with today's UI. These must be fixed first. They are filed as standalone bugs (§9) because they matter with or without Supabase.
4. **SPENDLY-436 is closed in Jira but its production repair never ran.** `docs/SPENDLY-436-materialized-balance-fix.md:30`: HDFC stored ₹69,714.50 vs recalculated ₹56,132.50, "Not run yet".
5. **Supabase today is Storage-only.**
   - Free plan, project `ganesh-seva-storage`, shared with Ganesh Seva along with its service-role key (`supabase/.temp/linked-project.json`; `docs/SPENDLY-78-POST-MERGE-DEPLOY.md:93-98`).
   - There are no tables or migrations.
   - There is no Supabase Auth: the client uses only the publishable key (`lib/supabase.ts:12-18`).

**Recommendation:** proceed only after a go/no-go decision (Phase 0). If the decision is go:
- use **Option A**: a Blaze-plan Firestore trigger feeding an idempotent, version-guarded upsert into a **dedicated** Supabase project, plus a scheduled reconciler;
- read through **Supabase third-party auth (Firebase) + RLS**, with a Netlify read broker as the fallback;
- migrate screens one module at a time behind a remote kill switch, starting with historical and reporting reads.

---

## 2. Current architecture (evidence)

### 2.1 Firebase
| Area | Finding | Evidence |
|---|---|---|
| Project | One project `expenseapp-27f94` for dev and prod, no staging; a sibling Vite app also writes to it | `docs/AGENT_WORKFLOW.md` §7; `docs/FIREBASE_RULES_DEPLOY.md:26-37` |
| Plan | Spark (no Cloud Functions, no Eventarc, no extensions) | `functions/src/index.ts:23-30`; `docs/EPF.md:182`; `docs/SPENDLY-423-epic-plan.md:14,73` |
| Auth | Email/password, Google (native ID token / web popup), phone; duress proxies uid → `users/{uid}_duress` | `providers/AuthProvider.tsx:193,227,258-259,272,339-343` |
| Persistence | Web IndexedDB durable; native silently memory-only | `lib/firebase.ts:120-143` |
| Write pipeline | `commitMutations` = one batch + `meta/outboxAck_{id}` + AsyncStorage outbox (native). Replay is sequential; a non-idempotent replay is guarded by the ack; a failed replay entry is dropped | `lib/commitMutations.ts:95-216`; `lib/writeOutbox.ts:10-103` |
| Writes that bypass the outbox | EPF, portfolio, SIP, investments, borrowings/receivables, bills, subscriptions, categories, trips, spaces, splits, vaults | see §1.2 |
| Server writers | `epf-cron` (Admin SDK, GitHub Actions clock), `delete-account` (recursiveDelete), admin scripts | `netlify/functions/*.ts`; `scripts/*` |
| Rules | `isOwner` (incl. `_duress`), strict per-collection validators, a 23-collection catch-all without validation, default deny | `firestore.rules:19-22,975-987` |
| Scheduling | GitHub Actions cron → Netlify function with a cursor page loop (epf-cron pattern). Netlify's synchronous limit is ~10 s | `.github/workflows/epf-cron.yml`; `netlify/functions/delete-account.ts:40-47` |
| Observability | `lib/errors.ts` redacting logger → **no-op** reporter; no Sentry/Crashlytics | `lib/errorReporting.ts:23-30`; `lib/env.ts:49-53` |

### 2.2 Supabase
| Area | Finding | Evidence |
|---|---|---|
| Project | `rmghavkavnmjdedebeyj` "ganesh-seva-storage", Postgres 17.6, shared Spendly + Ganesh | `supabase/.temp/*` |
| Plan | Free; pauses after inactivity, so there is a keep-alive every ~3 days | `docs/SUPABASE_KEEP_ALIVE.md:3-8`; `.github/workflows/supabase-keep-alive.yml` |
| DB objects | Only `_keep_alive_logs` + `keep_alive()` | `supabase/keep-alive.sql:23-49` |
| Migrations | None (no `supabase/migrations`, no `config.toml`) | `ls supabase/` |
| Client | Publishable key only, no session | `lib/supabase.ts:12-18`; `lib/env.ts:44-47` |
| Identity bridge | Edge Functions decode the uid, then call Firestore REST *as the caller* (Firestore verifies the token). No JWKS/aud check; deployed `--no-verify-jwt` | `supabase/functions/spendly-files/handler.ts:119-177`; `package.json:103,105` |
| Service role | Only in Edge Function env; guard test scans for it | `supabase/functions/spendly-files/index.ts:56,64`; `services/ganesh/storage/storageSecurity.test.ts` |
| Local testing | No local Supabase; `networkGuard` blocks Supabase in test mode | `lib/networkGuard.ts:28-35` |

### 2.3 Reads
- **Global at start:** `users/{uid}`, `system_settings/global`, `expenses`/`incomes` (`limit(300)`), `accounts`, `accountTypes`, `subscriptions`, `categories`.
- **Unbounded, idle-deferred:** `accountPayments`, `accountEntries`, `accountTransfers` (`providers/FinanceDataProvider.tsx:608-787`).
- `ensureCategoryHierarchy` does an unconditional `getDocs(categories)` on every login (~287 reads) (`lib/ensureCategoryHierarchy.ts:63-69`). This was flagged by SPENDLY-416 F2 and is not fixed.
- **Dashboard:** mounts 4 more listeners, including a duplicate `expenses` listener (`hooks/useRecentExpenses.ts:25-28`). The net-worth widget always mounts local `usePortfolio` listeners (`hooks/useUnifiedNetWorth.ts:128`).
- `useLedgerEvents` is unbounded (`hooks/useLedgerEvents.ts:42-45`).

### 2.4 Materialized state (SPENDLY-422/423) as found in code
| Value | Owner today | Status |
|---|---|---|
| Bank `currentBalance` | Client `increment()` in the same batch (`shared/utils/balanceMutations.ts:32-140`) | Authoritative for the UI; gaps (P0-2) |
| CC `currentOutstanding` | Same | Authoritative; `unbilledSpend`/`statementDue`/cycle fields are rebuild-only (P0-3) |
| `financialSummaries/dashboard_{YYYY-MM}` | Client increments (`shared/utils/dashboardMutations.ts`) | Read by the dashboard; `categoryTotals` broken (P0-1) |
| `financialSummaries/epf` | Client increments (`shared/utils/epfMutations.ts`) | Read for net worth |
| `financialSummaries/netWorth`, `/investments` | Client increments | **Written, never read**; inaccurate (P1-4) |
| Net worth shown | Derived live by `composeNetWorth` (`shared/utils/netWorth.ts:106-198`) | Two definitions (live vs. stored doc) |
| Monthly spend | `dashboard_*`, `journalPeriodSummary`, `insightMetrics`, `reconciliation.calculateDashboardSummaries` | ≥4 implementations |

---

## 3. Data-flow inventory (Spendly financial domains)

- **Ownership:** every collection below sits at `users/{uid}/<collection>` and is owned by the path uid.
- **Columns:**
  - **Del:** S = soft, H = hard.
  - **upd:** whether a reliable `updatedAt` exists.
  - **CM:** whether writes go through `commitMutations`.

| Domain | Collection | Doc identity | Create / Update / Delete (file) | Del | upd | CM | Financial fields | Related | Stored summary fields | Supabase today | Sync risks | Proposed strategy |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Expenses | `expenses` | auto; `stmt_<fnv64>`; `{subscriptionId}_{period}` | `services/ledger/createLedgerTransaction.ts:74`, `services/subscriptions/duePost.ts:40`, `hooks/useSplits.ts:425` / `services/ledger/mutateLedgerTransaction.ts:235` + relinks in trips/spaces/categories / soft delete `:391`, restore `:459` | S `deletedAt` (ISO) | partial (relinks don't bump it) | mixed | amount (**no currency field**), category/subcategory **names**, date, month, accountId, creditCardBillId | accounts, trips, spaces, splits, subscriptions, bills | — | none | relinks are invisible to an `updatedAt` poll; `createdAt` re-stamped by duePost | trigger CDC; soft delete → `deleted_at` column |
| Income | `incomes` | auto | `createLedgerTransaction.ts:138` / `mutateLedgerTransaction.ts:317` / soft | S | yes (ledger service) | yes | amount, source, date, month, accountId | accounts | — | none | — | trigger CDC |
| Audit | `ledgerEvents` | auto | `mutateLedgerTransaction.ts:217`; `services/creditCards/billPayment.ts:591`; rules forbid U/D | never | n/a | yes | before/after snapshots | rows | — | none | — | trigger CDC (append-only) |
| Accounts | `accounts` | auto | `providers/FinanceDataProvider.tsx:827` / `:876` + increments + rebuild / `:935` | H | **no** (`balanceUpdatedAt` only) | mostly | openingBalance, balanceAsOfDate, currency, creditLimit, billGenerationDay, **currentBalance, currentOutstanding, statementDue, unbilledSpend…** | accountTypes | many (materialized) | none | materialized fields drift (P0-2/3); hard delete | trigger CDC; copy stored values **and** recompute in SQL for reconciliation |
| Account types | `accountTypes` | auto | `FinanceDataProvider.tsx:1042` / — / `:1061` | H | no | yes | name decides credit vs bank | accounts | — | none | write vs read classification mismatch (P0-3) | trigger CDC |
| Transfers | `accountTransfers` | auto; duePost id | `FinanceDataProvider.tsx:1476`; `duePost.ts:55` / — / `:1546` | H | no | yes | fromAccountId, toAccountId, amount, date | accounts | — | none | hard delete | trigger CDC (delete event) |
| Entries | `accountEntries` | auto; `sc_`/`sr_`; UUID | `FinanceDataProvider.tsx:1375`; `useSplits.ts`; `services/portfolio/investmentCash.ts:276` / — / `:1443` | H | no | mixed | accountId, amount, direction, transferId | accounts, splits, investment cash | — | none | investment-cash leg has no balance op (P0-2) | trigger CDC |
| Bill payments & cashback | `accountPayments` | UUID / `cashback_<fnv64>` / auto | `billPayment.ts:216,310,438`; `FinanceDataProvider.tsx:1206-1357` | S `voidedAt` | after edit/void only | yes | from/to, amount, creditCardBillId, cashbackKind, billAppliedAmount | accounts, bills, expenses | — | none | — | trigger CDC |
| CC bills | `creditCardBills` | `${accountId}_${statementDate}`; legacy auto duplicates | `services/creditCardBills/autoBill.ts:58`; `CreditCardBillsProvider.tsx:320-920` | S `CANCELLED` | yes | mixed | statementAmount, minimumDue, amountPaid, remainingAmount, status, paymentIds | accounts, payments | amountPaid (increment **and** absolute writes) | none | last-writer-wins on amountPaid (P0-3); legacy duplicates | trigger CDC |
| Borrowings | `borrowings` (+ `borrowingRepayments`) | auto | `BorrowingsReceivablesProvider.tsx:502-737` (direct batches) | H (cascade) | parent yes / child no | **no** | principal, interest terms, creditedAccountId; materialized outstanding | accounts | outstanding etc. (absolute) | none | no account balance op (P0-2); cascade hard delete | trigger CDC |
| Receivables | `receivables` (+ `receivableRepayments`) | auto | `BorrowingsReceivablesProvider.tsx:794-1157` | H | parent yes | **no** | originalAmount, sourceAccountId, receivedAccountId | accounts, spaces | outstanding etc. | none | `waivedInterest` vs `interestWaived` | trigger CDC |
| Recurring / EMI | `subscriptions` | auto | `hooks/useSubscriptions.ts:75-131`; `duePost.ts` | H | no | mostly no | amount, frequency, type `emi`, accountId | accounts | — | none | duePost posts have no balance op (P0-2) | trigger CDC |
| Investments / FD | `investments` | auto | `hooks/useInvestments.ts:93-157` | H; close = status | no | no | principal, rate, units, NAV, dates | accounts | — | none | — | trigger CDC (wave 3) |
| Holdings | `holdings` (+ `portfolioTransactions`, `investmentCashTransactions`, `portfolioSettings`, `holdingAdjustments`) | UUID / deterministic | `services/portfolio/investmentCash.ts:390-1075`; `services/portfolio/holdingAdjustments.ts` | H | holdings yes | no | quantity, averageBuyPrice (materialized), cash amounts | stockProfiles | `portfolioSettings.cashBalance` (3rd copy of cash) | none | holdingAdjustments never commit (P0-5) | trigger CDC (wave 3) |
| EPF | `epfProfile`, `epfEstablishments`, `epfContributions`, `epfTransfers`, `epfInterestEntries`, `epfReconciliations`, `epfWageHistory`, events | deterministic month/FY ids | `hooks/useEpf*.ts`; **server** `netlify/functions/epf-cron.ts:301-514` | S `archived` / H | mostly yes | no | wage, shares, credit, interest, closing | establishments | `financialSummaries/epf` | none | server writes bypass any client hook | trigger CDC (wave 3) |
| Summaries | `financialSummaries/{netWorth, investments, epf, dashboard_*}` | fixed | client increments; `scripts/rebuild-domain-summaries.ts` | never | `calculatedAt` | mixed | totals | — | — | none | known defects (P0-1, P1-4) | **do not sync as truth** (§4.3) |
| Excluded | `meta/*` (outbox acks), `stats`, `notifications`, `users/{uid}_duress/**`, Nutrition docs, top-level `splits`/`vaults`/`paymentRequests` | — | — | — | — | — | — | — | — | — | decoy data; bookkeeping; multi-user | allowlist excludes them |

Further unknowns:
- **Legacy collections per user** (`focus`, `goals`, `profile`, Nutrition docs): UNKNOWN. Verify with a read-only Admin `listCollections()` dry-run.
- **Whether spendly-files is live:** UNKNOWN. Verify with `supabase functions list`.

---

## 4. Target architecture

### 4.1 Source-of-truth rules
1. Firestore is the only write path for user data. Supabase is never written by the app.
2. **Authoritative records:** the source collections in §3.
3. **Authoritative current-state values:** the Firestore materialized fields (`accounts.currentBalance`, `currentOutstanding`, `financialSummaries/epf`), but **only after** the P0 bugs are fixed and the production reconciliation passes. Supabase *copies* these values for display and *independently recomputes* them in SQL for reconciliation only.
   - There is never a second owner of a number shown to the user.
4. Supabase-only derivations are allowed for historical and reporting aggregates that Firestore does not materialize (period/category/merchant reports, cash-flow history). Each is golden-tested against the TypeScript reference implementation (`shared/utils/*`) on shared fixtures.
5. `financialSummaries/netWorth` and `/investments` are not synced as truth.

### 4.2 Change capture: options
| Option | How | Sees every write? | Freshness | Firestore read cost | Ops cost | Verdict |
|---|---|---|---|---|---|---|
| **A. Blaze + `onDocumentWritten`** on `users/{uid}/{col}/{docId}` (allowlist) | 2nd-gen function, region asia-south1 (same as the existing `ganesh` codebase), upserts to Postgres with a version guard; retry on failure; failures recorded | **Yes**: client, outbox, admin, recursiveDelete | seconds | ~0 extra reads (the event carries the doc) | Needs a billing account. Low volume is expected to sit inside the free invocation tier (**verify current pricing**) | **Recommended** |
| B. Change journal in `commitMutations` + worker | Append `changeLog` in the same batch | **No**: most writers bypass `commitMutations` | minutes | 1–2 reads per change | Refactor ~40 writers to centralize | Rejected unless all writers are centralized first |
| C. Scheduled full or incremental scan (GitHub Actions → Netlify) | Page every allowlisted collection per user; diff | Yes, eventually | hours (the GitHub cron is coarse and disabled after 60 inactive days) | **Full read of every synced doc per run.** Could double today's daily reads | No billing change | **Fallback** if Blaze is refused; reconciler only otherwise |
| D. Client dual-write to Supabase | App writes both | No (server writes; offline) | — | — | Second write path, two sources of truth | Rejected |

**Recommendation:** use A for capture and C (paged, weekly, count-first) as the reconciler. If the user refuses Blaze, the architecture becomes C-only, with an explicit freshness downgrade, and Phase 4 (current-balance reads) is cancelled.

### 4.3 Mapping and schema
- **Dedicated Supabase project** for Spendly financial data.
  - Not `ganesh-seva-storage`: this separates the service-role key's blast radius and the pause and keep-alive coupling.
  - The Free plan allows 2 projects (**verify**).
- **Schema-as-code:** `supabase/migrations/*.sql`, applied by a reviewed manual step at first, with a CI lint.
- **One table per synced collection.**
  - Natural key: primary key `(uid text, doc_id text)`.
  - Typed columns for the financial fields.
  - `doc jsonb` holding the raw source (sentinels normalized).
  - Metadata columns: `source_path`, `source_update_time timestamptz` (the Firestore document `updateTime`; the version), `deleted_at`, `source_deleted bool`, `schema_version int`, `synced_at`.
- **IDs:** kept verbatim as `text`. Composite and deterministic ids are preserved.
- **Amounts:** `numeric(18,2)`. There is no currency field on expenses, so the convention is INR-default per `accounts.currency`. This is to be confirmed in Phase 0.
- **Timestamps:** the mixed types (Timestamp, ISO string, epoch ms, JS Date) are normalized by a pure mapper in `shared/utils/readModel/` with vitest tests.
- **Unknown or unsupported shapes:** the row is stored in `doc jsonb`, typed columns are left null, the row is flagged `mapping_status='unmapped'`, and a metric is incremented. **Silent drops are never allowed.**

### 4.4 Create, update and delete processing; idempotency; ordering
- **Upsert:**
  ```sql
  insert … on conflict (uid, doc_id) do update … where excluded.source_update_time > t.source_update_time
  ```
  Duplicates and replays are no-ops; older events cannot overwrite newer state.
- **Delete event:** a tombstone (`source_deleted=true`, `deleted_at=event time`) under the same guard. Rows are never physically removed except by the account-deletion purge.
- **Soft-delete fields** (`deletedAt`, `voidedAt`, `CANCELLED`, `archived`) map to columns. Read views filter them, the same way `isActiveLedgerRow` does (`shared/utils/ledgerRow.ts:9-19`).
- **Multi-document batches** arrive as independent events. Views must tolerate transient half-states. The freshness contract (§4.8) covers display.

### 4.5 Retry, dead letter, checkpoints
- **Trigger** retry policy is enabled. When retries are exhausted, it writes `sync_failures(uid, path, event_id, error_class, attempts, first_seen, last_seen)` to Postgres. If Postgres itself is down, it writes to an admin-only Firestore `syncFailures` doc.
- **Reconciler** (paged; cursor per uid and collection, stored in `sync_checkpoints`):
  - compares Firestore `count()` aggregations with Postgres counts;
  - on a mismatch or on a schedule, does a full paged compare of `updateTime` per doc and repairs from Firestore.
- **Backfill** reuses the reconciler's repair path, so backfill and live sync share one idempotent writer.

### 4.6 Observability and alerting
- **Postgres tables:**
  - `sync_status(uid, collection, last_event_at, last_synced_at, lag_seconds, pending_failures)`
  - `sync_runs` (reconciler/backfill: counts, repairs, durations)
- **Signals:**
  - the GitHub Actions run fails, with a step summary, on `failures > 0`, lag above SLO, or divergence;
  - a dead letter older than 24 h fails the nightly run, so **a failure cannot stay unnoticed**;
  - the app reads `sync_status` to drive freshness badges.

### 4.7 Authentication and authorization for reads
| Option | Mechanism | Pros | Cons |
|---|---|---|---|
| **1. Supabase third-party auth: Firebase** | The app sends the Firebase ID token as the Supabase bearer; RLS `uid = auth.jwt()->>'sub'` | No custom backend, no service role in the read path, Postgres-enforced isolation | Firebase users need a `role: authenticated` custom claim (Admin SDK `setCustomUserClaims` from a Netlify function, or a blocking function). **Plan availability and exact setup to verify in the spike** |
| 2. Netlify read broker | `verifyIdToken(checkRevoked)` → service-role query filtered by the verified uid | Proven pattern in the repo | 10 s limit, one invocation per read, authz lives in app code |
| 3. Edge-function Firestore-REST bridge | Existing pattern | Reuses code | One Firestore read per request; no aud check |

**Recommendation:** spike Option 1. Fall back to Option 2. In every case:
- RLS is enabled with default deny on every table;
- `anon` has no grants;
- the service role exists only in the trigger, reconciler and Edge Function environments;
- cross-user tests run against local Supabase.

### 4.8 Freshness, offline and fallback
**Per-screen SLO:**

| Screen | Freshness target |
|---|---|
| historical Journal, reports | ≤ 60 s |
| insights | ≤ 5 min |
| current balances (Phase 4) | ≤ 10 s, **plus** an overlay of the user's own pending writes |

**Pending writes:** for the user's own writes, the screen overlays rows from the Firestore local cache or outbox until `sync_status.last_synced_at ≥ write time`.

**Staleness:** shown as "Updating…" when there are pending writes; shown as "Data may be out of date — last synced HH:MM" when the lag is above the SLO. A stale value is never presented as current.

**Outage:** if Supabase is unavailable or paused, the screen falls back to its retained, bounded Firestore query, behind the same read-path abstraction.

**Kill switch:** a remote, per-screen setting `system_settings/global.readModel.<screen> = firestore | shadow | supabase`. It is client-read-only; rules have `write: false`.

**Offline:** migrated screens fall back to Firestore cache behaviour, so offline works the same as today.

### 4.9 Cost (verify against current pricing pages at decision time)
- **Firestore:** Option A adds ~0 reads; the reconciler adds `count()` reads plus weekly paged reads.
- **Cloud Functions on Blaze:** one invocation per write.
- **Supabase Free:** 500 MB DB; pauses after inactivity (real traffic replaces the keep-alive); **no backups**. That is acceptable only because the read model is rebuildable from Firestore.
- **Netlify:** reconciler and claim-setter invocations.
- **GitHub Actions:** schedules.

### 4.10 Rollback
- Every migrated screen keeps its Firestore path until Phase 5 sign-off. The kill switch reverts a screen with no app release.
- The sync can be disabled by undeploying the trigger. Firestore is unaffected.
- Supabase can be dropped and rebuilt from Firestore by the backfill at any time.
- No Firestore data is deleted or rewritten by this initiative.

---

## 5. Correctness findings (P0–P3), filed as standalone bugs

Labels:
- **[verified]** means re-checked in code by hand during this audit.
- **[observed]** means found by a sub-audit and not independently re-checked.

| Rank | Finding | Evidence |
|---|---|---|
| P0-1 | Dashboard `categoryTotals.<cat>` dotted keys are written through `set({merge:true})`, which creates literal top-level fields, so `categoryTotals` is empty until a rebuild **[verified]**. Create writes `category` keys; edit/delete also write `category::subcategory`. Rebuild buckets by `date.substring(0,7)`, the client by `row.month` | `shared/utils/dashboardMutations.ts:33,42-47`; `lib/commitMutations.ts:110-111`; `shared/utils/reconciliation.ts:84,99-107` |
| P0-2 | Balance-moving writes skip `currentBalance`/netWorth ops: borrowings/receivables and their repayments **[verified: 0 balance ops in the provider]**, the bank leg of the investment-cash transfer, duePost expenses/transfers, `createSplit`'s personal expense, legacy `addPayment` **[observed]**. Splits apply balance ops via `batch.update`, which fails if `financialSummaries/netWorth` is missing **[verified]** | `providers/BorrowingsReceivablesProvider.tsx`; `services/portfolio/investmentCash.ts:276-334`; `services/subscriptions/duePost.ts:53-95`; `hooks/useSplits.ts:699-703` |
| P0-3 | CC materialized fields drift. `unbilledSpend` is never maintained on expense create/edit/delete **[verified]**. `statementDue`/`paidThisCycle`/`cashbackThisCycle`/`availableCredit` are rebuild-only **[verified for statementDue]**. Credit-card classification differs between writes (`accountTypeId`/name) and reads (`getAccountKind`). The CC rebuild ignores incomes/entries that the write path applies. Bill `amountPaid` is written both by increment and as an absolute value **[observed]** | `shared/utils/balanceMutations.ts:61-77`; `services/ledger/createLedgerTransaction.ts:118-120`; `services/ledger/fetchAccountTypes.ts:43-44`; `CreditCardBillsProvider.tsx:684-698` |
| P0-4 | SPENDLY-436 production reconciliation was never applied; HDFC variance is unresolved; SPENDLY-417/419 backfills are "not run" per their docs | `docs/SPENDLY-436-materialized-balance-fix.md:30`; `docs/SPENDLY-417-cc-bill-payment-reconciliation.md:72-76`; `docs/SPENDLY-419-portfolio-recalibration.md:5` |
| P0-5 | Holding adjustments are never persisted: the callback returns `batch` without `commit()`, and `commitWrite` awaits a non-promise. The settings doc id is `main` vs the real `config` **[verified]** | `services/portfolio/holdingAdjustments.ts:94-164,243,12`; `lib/firestoreWrite.ts:114-122` |
| P1-1 | Three divergent rebuild implementations. The in-app rebuild writes only on variance (so the flag stays `needs_reconciliation`) and never clears `summaryReconciliationStatus` **[verified]**. No tests. Scripts enumerate `users` via `.get()`, skipping uids without a root doc. The domain script uses a single batch with no 500-op chunking | `services/ledger/rebuildFinancialSummaries.ts:130-145`; `scripts/rebuild-*.ts:182,255`; `scripts/rebuild-domain-summaries.ts:82` |
| P1-2 | `financialSummaries/netWorth` and `/investments` are written but have no reader, and they disagree with the live `composeNetWorth` (no holdings value, FD or quotes) | `hooks/useNetWorthSummary.ts` (no callers); `scripts/rebuild-domain-summaries.ts:209-210` |
| P1-3 | The read premise is wrong by about 50–100×. The cheapest read reductions need no Supabase: `ensureCategoryHierarchy` early-exit (~287/login), the duplicate `useRecentExpenses` listener, gating `usePortfolio` in net worth, bounding `accountPayments`/`accountEntries`/`accountTransfers`/`ledgerEvents`, gating the `AccountsList` 7-source subscription | §2.3; `docs/PERF_DIAGNOSIS_2026-10-10.md:47-49` |
| P2-1 | No uniform `updatedAt`; mixed timestamp types; `createdAt` re-stamped on re-runs (autoBill, duePost, epfReconciliations, merchantOverrides) | §3 |
| P2-2 | Account deletion does not purge Supabase (Storage today; the read model tomorrow) and has never been run end to end | `docs/SPENDLY-7-account-deletion.md:184-211` |
| P2-3 | The Supabase project and service-role key are shared with Ganesh Seva | `docs/SPENDLY-78-POST-MERGE-DEPLOY.md:93-98` |
| P3-1 | Doc drift: `.claude/spendly_epic_execution_roadmap.md`, required by `AGENT_WORKFLOW.md` §1, is missing. SPENDLY-418 is still To Do but superseded by SPENDLY-422/426. The keep-alive is described as read-only but upserts a row | `supabase/keep-alive.sql:38-40` |

---

## 6. Phased plan

**Critical path:** P0 bugs → production reconciliation → Phase 0 baseline and go/no-go → identity spike ∥ schema → change capture → sync worker hardening ∥ observability → backfill → shadow validation → read-path abstraction → Phase 3 screens → Phase 4 modules (serial) → Phase 5.

**Can run in parallel:**
- the read quick-wins task, at any time;
- the identity spike and the schema bootstrap;
- observability and account-deletion purge, once capture exists;
- the two Phase 3 screen groups.

### Phase 0: Discovery and correctness baseline
| Item | Content |
|---|---|
| Objectives | Fix the known materialized-state defects; finish the production reconciliation; re-baseline reads and cost; take the go/no-go and Blaze decision |
| Scope | Standalone bugs P0-1…P0-5, P1-1, P1-2; the ADR story; the baseline story |
| Dependencies | none |
| Repo changes | bug fixes (separate tickets); `docs/` ADR; read-only baseline script |
| Risks | Production data is wrong today; there is no staging (shared Firebase) |
| Deliverables | ADR with decision; baseline report (counts, totals, per-account stored vs recomputed); measured reads/day from the Firebase usage console |
| Automated tests | Regression tests per bug; increment == rebuild property tests |
| Manual tests | Reviewed dry-run reports |
| Acceptance | All P0 bugs Done on `main`; reconciliation applied with approval; baseline variance = 0 or explained; ADR signed off by the user |
| Rollback | n/a (no sync yet) |
| Exit | Go decision recorded **or** the epic is closed as won't-do with the quick wins delivered |

### Phase 1: Schema, identity and sync foundation
| Item | Content |
|---|---|
| Objectives | Dedicated Supabase project with migrations; secure read identity; complete change capture with idempotent version-guarded upserts; failure visibility; account-deletion purge |
| Scope | Wave 1 collections: `expenses`, `incomes`, `ledgerEvents`, `accounts`, `accountTypes`, `accountTransfers`, `accountEntries`, `accountPayments`, `creditCardBills`, `categories` |
| Dependencies | Phase 0 exit |
| Repo changes | `supabase/migrations/`, `functions/` new codebase (or Netlify reconciler for option C), `shared/utils/readModel/` mappers, rules for any new admin collection, `netlify/functions/delete-account.ts` purge |
| Risks | Blaze billing; RLS misconfiguration; mapping gaps |
| Deliverables | Running trigger in shadow (writes to Supabase, nothing reads it) |
| Automated tests | Mapper unit tests; idempotency/ordering tests against local Supabase; RLS cross-user tests; emulator trigger tests |
| Manual tests | Create/edit/delete each Wave 1 type in Spendly Test → row appears, updates, tombstones |
| Acceptance | All §10 synchronization tests pass |
| Rollback | Undeploy the trigger; drop the project |
| Exit | 7 days of shadow sync with zero unexplained failures |

### Phase 2: Shadow synchronization
| Item | Content |
|---|---|
| Objectives | Backfill history; prove parity; measure lag and failures |
| Scope | Backfill story, divergence/repair story, observability |
| Dependencies | Phase 1 |
| Deliverables | Parity report: counts, field-level diffs, SQL vs TS calculation parity per user |
| Automated tests | Resumable backfill test; backfill-vs-live race test; golden SQL-vs-TS tests |
| Manual tests | Interrupt and resume the backfill (dry-run first) |
| Acceptance | 14 consecutive days with divergence = 0 (or auto-repaired and explained), p95 lag ≤ SLO, dead letters = 0 older than 24 h |
| Rollback | Truncate and re-backfill |
| Exit | Parity report signed off |

**No production reads move in Phase 2.**

### Phase 3: Low-risk read migration
| Item | Content |
|---|---|
| Objectives | Move historical and reporting reads behind the read-path abstraction and kill switch |
| Scope | Journal history beyond the staged window, month-range loads, reports/export; insights/range analytics, cash-flow history, `ledgerEvents` audit, cashback history |
| Dependencies | Phase 2 exit; read-path abstraction story |
| Acceptance | Shadow-compare mode shows 0 diffs for 7 days per screen before the flip; outage drill falls back correctly |
| Rollback | Kill switch → firestore |
| Exit | Measured read reduction recorded |

### Phase 4: Financial read migration (one module at a time)
| Item | Content |
|---|---|
| Order | Accounts & balances → credit cards & bills → investments/EPF/FD → net worth & dashboard |
| Gate per module | Its P0 bugs are Done; reconciliation passes; Wave 2/3 collections are synced and in parity; pending-write overlay is proven |
| Rollback | Kill switch; a balance mismatch beyond tolerance auto-reverts the screen to Firestore and alerts |

Phase 4 does not happen if Blaze is refused (option C).

### Phase 5: Hardening and optimization
| Item | Content |
|---|---|
| Scope | Recovery drills (restore Supabase from scratch, trigger outage, Supabase pause), RLS/security review, query/index tuning, measured Firestore read and cost review, runbook, production-readiness review, retirement plan for the Firestore fallback paths |
| Exit | Readiness review signed off by the user |

---

## 7. Validation matrix
Every test listed in the request's §10 is assigned to a story in Jira, in that story's "Automated testing" section. The mapping is summarized in §9.

## 8. Unresolved questions (for the user)
1. Is enabling **Blaze** on `expenseapp-27f94` acceptable? `docs/ganesh-seva-rbac/KAN-36…md:64,81` currently says "Do not enable Blaze".
2. Is the goal reporting and analytics capability (which justifies this), or read cost (which doesn't, per §1)?
3. A dedicated Supabase project for Spendly, yes or no?
4. Currency: confirm that all expense amounts are in the account's currency (no field on `expenses`).
5. Was the SPENDLY-436 `--apply` run after 2026-10-10? The SPENDLY-487 header value of ₹56,080.50 hints yes, but nothing records it.
6. Should SPENDLY-418 be closed as superseded? It is left untouched pending your call.

## 9. Jira mapping (created 2026-10-11, verified in Jira)

### Standalone correctness work
These sit outside the epic because they matter with or without Supabase. Each one blocks the epic stories listed.

| Key | Type | Pri | Summary | Blocks |
|---|---|---|---|---|
| SPENDLY-495 | Bug | Highest | Dashboard period summaries (`categoryTotals` dotted keys, keys, bucketing), P0-1 | 500, 510, 518 |
| SPENDLY-496 | Bug | Highest | Balance-moving writes skip balance/netWorth ops, P0-2 | 500, 510, 514, 515 |
| SPENDLY-497 | Bug | Highest | Credit-card materialized fields drift, P0-3 | 500, 510, 516 |
| SPENDLY-498 | Bug | Highest | Holding adjustments never persisted, P0-5 | 514, 517 |
| SPENDLY-499 | Bug | High | Consolidate rebuilds, status flags, retire write-only summaries; P1-1/P1-2 | 500, 503, 510, 518 |
| SPENDLY-500 | Task | Highest | Production reconciliation (436 apply / HDFC, 417/419 backfills), P0-4 | 503, 515, 516 |
| SPENDLY-501 | Task | Medium | Firestore read quick wins (no Supabase), P1-3 | relates 502 |

### Epic SPENDLY-494: child stories
| Key | Phase | Pri | Summary | Blocked by |
|---|---|---|---|---|
| SPENDLY-502 | 0 | Highest | ADR, inventory, go/no-go (Blaze, project, identity, cost) | — |
| SPENDLY-503 | 0 | High | Correctness baseline and golden fixtures (read-only) | 499, 500 |
| SPENDLY-504 | 1 | High | Dedicated Supabase project, migrations, Wave 1 tables | 502 |
| SPENDLY-505 | 1 | High | Firebase identity → Supabase (third-party auth + RLS / broker) | 502, 504 |
| SPENDLY-506 | 1 | High | Change capture: `onDocumentWritten`, version-guarded upsert | 502, 504 |
| SPENDLY-507 | 1 | High | Failure recovery, replay, monitoring | 506 |
| SPENDLY-508 | 1 | High | Account-deletion purge and exclusions | 506 |
| SPENDLY-509 | 2 | High | Resumable backfill and scheduled reconciler | 506, 507, 508 |
| SPENDLY-510 | 2 | High | Shadow validation and 14-day parity gate | 495, 496, 497, 499, 503, 509 |
| SPENDLY-511 | 3 | Medium | Read-path abstraction, kill switch, freshness, fallback | 505, 510 |
| SPENDLY-512 | 3 | Medium | Journal history, month ranges, reports/export | 511 |
| SPENDLY-513 | 3 | Medium | Insights, cash-flow history, audit history, cashback history | 511 |
| SPENDLY-514 | 4 | Medium | Wave 2/3 sync and parity | 496, 498, 510 |
| SPENDLY-515 | 4 | Medium | Accounts and balances | 496, 500, 512, 514 |
| SPENDLY-516 | 4 | Medium | Credit cards and bills | 497, 500, 515 |
| SPENDLY-517 | 4 | Medium | Investments, EPF, FD | 498, 514, 516 |
| SPENDLY-518 | 4 | Medium | Net worth and dashboard | 495, 499, 517 |
| SPENDLY-519 | 5 | Low | Performance, security, cost validation | 518 |
| SPENDLY-520 | 5 | Low | Rollback drills, runbook, readiness review | 519 |

### Relates links to existing work
- **494** relates to 423, 436, 422, 135 and 2.
- **500** relates to 436, 417 and 419.
- **Bugs:**
  - 495 relates to 430.
  - 496 relates to 426, 434 and 418.
  - 497 relates to 427 and 432.
  - 498 relates to 421.
  - 499 relates to 431 and 428.
- **Tasks:** 501 relates to 416 and 502.
- **Epic stories:**
  - 505 relates to 2.
  - 506 relates to 156.
  - 508 relates to 7.
  - 512 relates to 487.

### Intentionally not created
- **No new ticket for summary materialization:** SPENDLY-423 and 424–435 are Done, and their gaps are filed as bugs 495–499.
- **No backup/restore ticket:** SPENDLY-135 owns it, and the read model is not a backup.
- **No duplicate of SPENDLY-418:** it is superseded by 422/426, which is flagged for the user and left untouched.
- **No separate "idempotent CUD processing" story:** that work is part of 506.
- **No separate "divergence repair" story:** that work is split between 509 and 510.
