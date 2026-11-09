# SPENDLY-736 — Audit: background calculations in the Expense app

This is a story in epic **SPENDLY-735**, "Server-side calculations: the app only delivers". It was audited on 2026-11-09. Rev 2 on the same day is rebased on `main` 8cca6639, which includes PR #288 (SPENDLY-682: `dailyJobCore`, `sip-daily`, `bill-daily` and the Worker's 03:00 UTC cron). It covers the Expense app only; Ganesh Seva and Nutrition are out of scope.

## The owner's rule (2026-11-09)
No calculation runs inside the app. The app only does two things:
- **Saves the user's own actions.** That includes the stored-total update made in the same save, offline included.
- **Shows stored results.**

Everything the app does in the background (on launch, on focus, on timers, or on listener updates) moves to a server job. GitHub Actions does the computing and the Cloudflare Worker triggers it; Netlify credits are low. After a money action, the app asks the server to run for that user (SPENDLY-737). Scheduled runs catch anything missed.

## How to read this
- **Weight:** CPU, IO, network and listeners on the phone.
- **Reads:** Firestore reads, taken from the code, not measured.
- **Rank:**
  - **P0** blocks the epic;
  - **P1** is heavy, writes financial data, or wastes writes;
  - **P2** is medium or rarely runs;
  - **P3** is light, or on screen only.
- **Unverified:** the read-model switches (`system_settings/global.readModel.*`) live in Firestore, so whether each item in C runs today wasn't checked.

## Findings

### A. Background passes that calculate and write

| # | Item | Trigger | Reads → writes | Weight | Server today | Rank |
|---|---|---|---|---|---|---|
| A0 | **Credit card bill pass** (`providers/CreditCardBillsProvider.tsx` `generateAutoBills`: drafts, refresh, allocation, duplicate merge) | first load, **every app focus**, every new bill id, money actions (`requestBillPass`) | on a large ledger: every card's expenses from Firestore (~600 reads on the owner account, SPENDLY-732) → `creditCardBills` | **heavy** | **`bill-daily`** (SPENDLY-727), but only for cards whose cycle closed today or yesterday | **P1**: SPENDLY-734 removes it from the app and widens `bill-daily` |
| A1 | **Subscription / EMI / recurring-transfer auto-post** (`providers/ExpenseReferenceDataProvider.tsx:805-823` → `processDueSubscriptions` `:729-803` → `services/subscriptions/duePost.ts:52-130`) | Startup idle once the subscriptions snapshot comes from the server; again on a change in subscription count | subscriptions listener (≤200), per-charge doc and account checks → `expenses`/`accountTransfers` (deterministic ids), `subscriptions.lastProcessed*`, account balances, `financialSummaries/dashboard_*` | light–medium | **none** | **P1**: writes money; EMIs post only when the app is opened |
| A2 | **Category taxonomy upgrade** (`providers/AuthProvider.tsx:198-207` → `lib/ensureCategoryHierarchy.ts:51-149`) | Every launch and sign-in (1 doc read when the stamp is current, `:88-100`) | On an upgrade: all categories twice, **every expense** (`remapExpenses`), budgets, rules, subscriptions, trips → remaps on all of them | light; **heavy** on an upgrade launch | none | **P1**: a full-ledger read and write burst on the phone |
| A3 | Accidental account-baseline repair (`providers/FinanceDataProvider.tsx:664-711`) | Every accounts snapshot (once per account per session) | accounts in memory → `accounts.balanceAsOfDate = null` | light | none (the manual rebaseline scripts are close) | P2 |
| A4 | Recurring-merchant detection (`app/(app)/_layout.tsx:70` → `hooks/useRecurringSync.ts` → `services/recurring/recurringSync.ts:152-168`) | App shell mount, then every expense-count, last-row or subscription change, once the full ledger is in memory | whole ledger in memory + `getDocs(recurringDismissals)` on each run → AsyncStorage queue, `recurringDismissals` | **medium**: CPU over the full ledger on every new expense | none | P2 |
| A5 | Daily net-worth snapshot (`components/dashboard/NetWorthWidget.tsx:86` → `hooks/useNetWorthSnapshotRecorder.ts:79-127`) | Dashboard mount; values steady for 2.5 s; once a day; 60 s retry | ~16 listeners (`useUnifiedNetWorth`) + **market quotes every 60 s while focused** → `netWorthHistory/{YYYY-MM}` | **medium** | none | **P1** |
| A6 | Logging streak / badges (`hooks/useGamification.ts:90-122`, on by default) | Dashboard mount, every expense change, day change | `stats/summary` + loaded expenses → `stats/summary` | light | none | P2 |
| A7 | EPF contribution catch-up and repairs (`hooks/useEpfCatchUp.ts:45-97`) | EPF tab mount | contributions, wage history → `epfContributions` (+ audit events) | light–medium | **epf-cron**, monthly (`30 5 3 * *`) | P1 (bundled with A8–A10) |
| A8 | EPF interest recompute (`hooks/useEpfInterestCatchUp.ts:50-101` → `useEpfInterest.ts:189-249`) | EPF tab mount, then 400 ms after any EPF change | **all** contributions, transfers, interest entries and reconciliations → `epfInterestEntries` (merge, plus deletes of stale years) | **medium** | none | **P1** |
| A9 | EPF summary sync (`hooks/useEpfSummarySync.ts:52-90`) | EPF tab mount + source changes | same as A8 + `financialSummaries/epf` → `financialSummaries/epf` | light | `rebuild-domain-summaries` (manual only) | **P1** (with A8) |
| A10 | EPF balance-tab interest recompute (`components/epf/EpfBalanceTab.tsx:104-111`) | Detail screen mount + changes | as A8 for one establishment | light–medium | none | P1 (with A8) |
| A11 | Portfolio daily snapshot (`components/portfolio/PortfolioDashboard.tsx:154-170` → `hooks/usePortfolio.ts:499-519`) | Portfolio tab and **every summary change, including each 60 s quote refresh** | a `getDoc(portfolioSnapshots/{today})` **on every run** (about 1 read a minute while focused) → `portfolioSnapshots/{date}` once a day | **medium**; also wastes reads | none | **P1** |
| A12 | Onboarding / setup-progress auto-writes (`providers/SetupProgressProvider.tsx:101-399`) | Data load, screen mounts | loaded data → `users.onboarding.*` | light | none | P3 |
| A13 | One-time launch migrations: privacy PIN to the device vault (`PrivacyPinProvider.tsx:100-170`), watchlist init (`useWatchlists.ts:174-202`), legacy snapshot purge (AsyncStorage) | Sign-in, route mount | small | light | n/a | **Stays**: PIN = SecureStore, device-only |

### B. Local reminder and notification planning

| # | Item | Trigger | Work | Weight | Server today | Rank |
|---|---|---|---|---|---|---|
| B1 | **Credit card bill reminder reconcile** (`providers/CreditCardBillsProvider.tsx` `refreshReminderSchedules` → `services/creditCardBills/billReminderScheduler.ts`) | Every bills snapshot, every prefs change, **every app focus** | For every bill: `getAllScheduledNotificationsAsync` + cancel + schedule up to 12 slots. **Bug, verified:** when notification permission is denied, every pass writes **one Firestore `creditCardBillReminderLogs` doc per eligible bill** (`onLog` → `writeReminderLog` on `status: "failed"`, reason `permission_denied`, scheduler `:214-221`). That means several writes on every focus, forever. | **medium** + wasted writes | `push-reminders` (bills, push mode) | **P1** |
| B2 | Financial Calendar notifications (`components/calendar/CalendarNotificationSync.tsx:35-56`) | Any plan change (1 s debounce) | cancels all `cal:` notifications and reschedules; listeners on reminders, subscriptions, borrowings, receivables | light–medium | `push-reminders` (calendar, dues) | P2 |
| B3 | Save Goals notifications (`components/goals/GoalReminderSync.tsx:33-43`) | Goals, flag, mode or day change | cancel and reschedule `goal:` | light | `push-reminders` (goals) | P2 |
| B4 | Reminders inbox (`providers/RemindersInboxProvider.tsx:70-125`) | Startup idle + every source snapshot | read-only compute, but **keeps ~8 listeners alive all session** (this is why B1 runs on every bills snapshot) | light CPU, medium listeners | `push-reminders` (partial) | P2 |
| B5 | Push registration / reminder mode (`hooks/usePushRegistration.ts`, `usePushReminderMode.ts`) | Launch, every focus, token rotation | permission check, Expo token (network) → `devices/{installId}` at most daily | light | n/a | **Stays**: device token |

**Local notifications are a device-only API.** In push mode, B1–B3 already stand down. The fix is to finish the push rollout to everyone (SPENDLY-222, step C4b) and keep local scheduling only as the fallback for devices without push. It should then re-plan only when the data changes, never just on focus.

### C. Read-model work on the device
These items are not calculations of money, but they cost battery. Each is gated by `readModel.*` switches.

| # | Item | Trigger | Weight | Rank |
|---|---|---|---|---|
| C1 | Read-model push after saves (`lib/readModelPush.ts`) | Every save / pending snapshot (2 s debounce, POST) | light | **Stays**: the user's own save |
| C2 | Client write outbox (`lib/readModelClientWrites.ts`) | Every save, online, sign-in | light | **Stays**: the user's own save |
| C3 | Realtime channel + **30 s catch-up poll while the channel is down** (`lib/readModelRealtime.ts`) | Sign-in; timer | light | P3 |
| C4 | Local copy hydrate / catch-up (`lib/readModelLocal/localCopy.ts:221-266`) | Launch / sign-in; the first time pages ~58 tables | **heavy** first time, then light | P2 (it is the offline source by design; keep it, but bound it) |
| C5 | Local copy refresh on focus (`FinanceDataProvider.tsx:501-511`) | Every focus when realtime is off | light–medium | P3 |
| C6 | Realtime apply / resync | Each ping | light; heavy on resync | P3 |
| C7 | **Copy-backed screen re-query** (`lib/readModelLocal/readSource.ts:82-108`) | Every copy change, `supabase` mode | **medium–heavy**: reads the whole table from SQLite and filters in JS (e.g. all expenses, then a 300-row window) | P2 |
| C8 | **Shadow compares on the device** (`readSource.shadow`, on each Firestore snapshot in `shadow` mode, plus journal, cash-flow, audit and group-fund network compares) | Each snapshot | **medium**: whole-table copy read per snapshot | P2: the server already does this nightly (`readmodel-verify` / `readmodel-parity`) |
| C9 | Firestore write-outbox replay (`lib/commitMutations.ts:193`) | Sign-in | light | **Stays**: the user's own saves |
| C10 | Spaces / rules refetch (`ExpenseReferenceDataProvider.tsx:584-596`) | Focus, >5 min stale | light | P3 |

### D. Checked: not background (no action)
- **SIP execution** runs in the app only from the manual button (`hooks/useSips.ts:224-243`), which is a user action and stays. Automatic execution is now on the server: **`sip-daily`** (SPENDLY-726) applies the app's `decideSipRun` in the user's zone. It goes live with the SPENDLY-682 rollout (`SIP_DAILY_ENABLED`, then the legacy cron retires).
- **Balance rebuild** (`EditAccountModal`) and `recalculateBill` run only when the user starts them.

### E. On-screen heavy computing (runs while a screen is open, again on every data change)
| # | Item | Weight | Rank |
|---|---|---|---|
| E1 | Fee intelligence `detectFees` (`hooks/useFeeIntelligence.ts:64-77`): Insights, Calendar, transaction detail, Fees. Covers all expenses, incomes, entries and accounts. | medium–heavy | P3: becomes a server-stored result (new data, full read-model treatment) |
| E2 | Ledger health audit `runLedgerAudit` (`components/ledger/LedgerHealthReport.tsx:124-129`): full-ledger scan | heavy, but one sub-tab | P3: server parity already finds invariant breaks |
| E3 | Market quote polling every 60 s while a screen is focused (`useMarketQuotes`, overview, watchlist, history) | light (network; paused in background) | P3: needed for live prices; the A5/A11 snapshots move off it |

### Existing server jobs
| Job | What it does | When |
|---|---|---|
| `dailyJobCore` (SPENDLY-725) | **the foundation every daily job writes through**: own-tree writes only, duress skipped, stamps, one atomic batch, create / `lastUpdateTime` preconditions as conflicts, read-model push, dry run, counts-only summary, read budget | library |
| `bill-daily` (SPENDLY-727) | the app's bill pass for cards whose cycle **closed today or yesterday**; a cashback-settled statement is born PAID | Worker 03:00 UTC (08:30 IST), gated by `BILL_DAILY_ENABLED` (not yet on) |
| `sip-daily` (SPENDLY-726) | the only automatic SIP executor (the app's `decideSipRun`) | Worker 03:00 UTC, gated by `SIP_DAILY_ENABLED` (not yet on) |
| `push-reminders` | push for bills, calendar, dues and goals; SIP, EPF and split events | every 15 min (Worker) |
| `epf-cron` | monthly expected contributions, credit-window repair, lifecycle | `30 5 3 * *` |
| `readmodel-sync` + verify + parity | Firestore → Supabase, counts, invariants | nightly |
| `readmodel-health` | sync freshness alarm | hourly |

Owner rollout of SPENDLY-682 is pending (`docs/LEGACY_CRONS_RETIREMENT_RUNBOOK.md`): reports, dry runs, Worker redeploy, legacy crons off, and both variables on, all in one window. **This epic depends on it:** once the app stops computing bills, `bill-daily` must be live.

Manual only: `rebuild-domain-summaries`, `rebuild-financial-summaries` (balances, card totals, EPF summary, dashboard periods), `rebaseline-account`, and the reconcile reports.

## What stays in the app, and why
- **The user's own save** (C1, C2, C9) and the stored-total update inside it: one atomic write, offline included.
- **The push device token** (B5) and the privacy PIN vault (A13): device-only APIs.
- **Local notifications as the fallback** when push is off or not permitted (B1–B3). They re-plan only when the data changes.
- **Live market prices** while a price screen is open (E3).
- **The on-device copy** (C4), as the offline source, until the owner decides otherwise. Its on-device shadow compares can stop (C8).

## Shared design for every move
1. **One kind of server job:** `scripts/<name>-daily.ts` plus a pure `scripts/lib/<name>DailyCore.ts`, writing **only through `dailyJobCore.applyJobWrites`** (SPENDLY-725). That gives own-tree writes, atomic batches, compare-and-set conflicts, stamps, read-model push, dry run and counts-only logs.
   - Each job gets a workflow gated by its own repository variable, dispatched by the Worker's daily 03:00 UTC cron (08:30 IST, before the 09:00 reminders).
   - No second framework, and no second writer of the same data.
2. **Find the work on Supabase** (0 Firestore reads) where a daily scan would otherwise read Firestore. Then **confirm on Firestore only for the items with work**, and write from Firestore (R4.3a).
3. **On-demand runs** (SPENDLY-737): after a money action the app asks, and the Worker starts the job for that user. The request is queued so no uid appears in public logs. Each daily job gets a "queued users only" mode.
4. **Never two writers.** When a job moves, its app code is deleted, and a guard test pins that it never comes back.
5. **Spark budget:** 50K reads/day, shared. Each job keeps its own read budget (`jobReadBudget`).

## Proposed stories (order)
| Order | Story | Covers | Rank | Note |
|---|---|---|---|---|
| 0 | **SPENDLY-682 rollout** (owner, existing runbook) | `bill-daily`, `sip-daily` live; legacy crons retired | **prerequisite** | Must be live before the epic ships |
| 1 | **SPENDLY-734** (rewritten): the app computes no bill pass; `bill-daily` also settles cards with work found on the read model | A0 | **P1** | Extends `bill-daily` (no new job). The read model finds stale settlements and late payments or cashback on any card, not only closing cards. The in-app pass is deleted. |
| 2 | **SPENDLY-737**: on-demand server run after a money action | infrastructure | **P0 for shipping** | Worker route + request queue. `bill-daily` gets a queued-users mode. `requestBillPass()` becomes the request. The epic can't reach `main` without it. |
| 3 | Bill reminders: stop the per-focus log writes; re-plan only on data change | B1 | **P1** | Small app fix that stops wasted writes now |
| 4 | Subscriptions / EMIs / recurring transfers post on the server (`subscription-daily`) | A1 | **P1** | Money writes; posts on the due day even with the app closed |
| 5 | EPF on the server: interest, summary, catch-up (extend `epf-cron` or a new `epf-daily` on `dailyJobCore`) | A7–A10 | **P1** | |
| 6 | Daily net-worth and portfolio snapshots on the server (server-side quotes, like `sip-daily`'s `sipQuote`) | A5, A11 | **P1** | Removes the snapshot recorders and the per-minute read |
| 7 | Category taxonomy upgrade on the server | A2 | P1 | |
| 8 | Small passes on the server: baseline repair, logging streak, onboarding stamps | A3, A6, A12 | P2 | |
| 9 | Recurring-merchant detection on the server (stored suggestions) | A4 | P2 | **New collection:** full read-model treatment |
| 10 | Read-model load on the device: stop on-device shadow compares; indexed copy queries | C7, C8 | P2 | |
| 11 | Local reminders as the fallback only, once push reaches everyone; inbox listeners trimmed | B1–B4 | P2 | Depends on SPENDLY-222 C4b |
| 12 | Fee intelligence and ledger health as server-stored results | E1, E2 | P3 | New data; last |

Each story is approved one at a time (docs/AGENT_WORKFLOW.md §3). 734 comes before 737, because 737's first consumer is the widened `bill-daily`.

## Open questions for the owner
1. **The on-device copy (C4):** keep it as the offline source, or narrow it once screens read stored results?
2. **Hourly vs daily** for subscription auto-post (story 4): the Worker's daily 03:00 UTC run is cheapest, and hourly posts closer to the due time.
3. **SIP auto-execution** was answered by SPENDLY-726 (`sip-daily`). It goes live with the SPENDLY-682 rollout.
