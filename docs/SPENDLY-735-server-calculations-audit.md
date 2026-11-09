# SPENDLY-736 — Audit: background calculations in the Expense app

This is a story in epic **SPENDLY-735**, "Server-side calculations: the app only delivers". It was audited on 2026-11-09 against the epic branch plus SPENDLY-734, the commit where the bill pass was removed. It covers the Expense app only; Ganesh Seva and Nutrition are out of scope.

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
- **SIP execution** runs only from the manual button (`hooks/useSips.ts:224-243`). Nothing executes SIPs automatically, on the device or the server; the server only sends SIP events from existing data. *Gap:* SIPs post only when the user presses the button. This belongs with A1 if the owner wants SIPs auto-posted.
- **Credit card bill pass:** removed from the app (SPENDLY-734); `bill-reconciler` owns it.
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
| `bill-reconciler` (SPENDLY-734, on PR #287) | creates, refreshes and settles bills | daily, plus Worker 00:00 UTC (needs the 737 on-demand trigger) |
| `push-reminders` | push for bills, calendar, dues and goals; SIP, EPF and split events | every 15 min (Worker) |
| `epf-cron` | monthly expected contributions, credit-window repair, lifecycle | `30 5 3 * *` |
| `readmodel-sync` + verify + parity | Firestore → Supabase, counts, invariants | nightly |
| `readmodel-health` | sync freshness alarm | hourly |

Manual only: `rebuild-domain-summaries`, `rebuild-financial-summaries` (balances, card totals, EPF summary, dashboard periods), `rebaseline-account`, and the reconcile reports.

## What stays in the app, and why
- **The user's own save** (C1, C2, C9) and the stored-total update inside it: one atomic write, offline included.
- **The push device token** (B5) and the privacy PIN vault (A13): device-only APIs.
- **Local notifications as the fallback** when push is off or not permitted (B1–B3). They re-plan only when the data changes.
- **Live market prices** while a price screen is open (E3).
- **The on-device copy** (C4), as the offline source, until the owner decides otherwise. Its on-device shadow compares can stop (C8).

## Shared design for every move
1. **One server runner per user** (`scripts/user-jobs.ts`, which grows out of `bill-reconciler`): modular jobs (bills, subscriptions, EPF, snapshots and so on), one workflow, the same read budget.
2. **Find the work on Supabase** (0 Firestore reads), then **confirm on Firestore only for the items with work**. Write with compare-and-set or deterministic ids, stamps, and server push (R4.3a, SPENDLY-680).
3. **On-demand runs** (SPENDLY-737): after a money action the app asks; the Worker starts the runner for that user, and requests are queued so no uid shows in public logs. **Scheduled runs:** daily at 00:00 UTC (before the 09:00 reminders); hourly where freshness matters (A1 posts on the due day).
4. **Never two writers.** When a job moves, its app code is deleted, and a guard test pins that it never comes back, as with the bill pass.
5. **Spark budget:** 50K reads/day, shared. Each job keeps its own allowance; finding work costs no Firestore reads.

## Proposed stories (order)
| Order | Story | Covers | Rank | Note |
|---|---|---|---|---|
| 1 | **SPENDLY-737** On-demand server run + per-user job runner | infrastructure | **P0** | `requestBillPass()` becomes "ask the server"; the epic can't reach `main` without it |
| 2 | **SPENDLY-734** Server bill reconciler; the app computes no bill pass | bills | P1 | built (PR #287), awaiting merge |
| 3 | Bill reminders: stop the per-focus log writes; re-plan only on data change | B1 | **P1** | small app-side fix that stops wasted writes now |
| 4 | Subscriptions / EMIs / recurring transfers post on the server (+ SIP auto-post if wanted) | A1 (+ D) | **P1** | money writes; posts on the due day even with the app closed |
| 5 | EPF on the server: interest, summary and catch-up in `epf-cron`, daily + on demand | A7–A10 | **P1** | extends the existing job |
| 6 | Daily net-worth and portfolio snapshots on the server (server-side quotes) | A5, A11 | **P1** | removes the snapshot recorders and the per-minute read |
| 7 | Category taxonomy upgrade on the server | A2 | P1 | the upgrade burst runs as a job; the app only reads |
| 8 | Small passes on the server: baseline repair, logging streak, onboarding stamps | A3, A6, A12 | P2 | |
| 9 | Recurring-merchant detection on the server (stored suggestions) | A4 | P2 | **new collection**: full read-model treatment (mapping, migration, RLS, allowlist, purge) |
| 10 | Read-model load on the device: stop on-device shadow compares; indexed copy queries | C7, C8 | P2 | the server's nightly parity covers the compares |
| 11 | Local reminders as the fallback only, once push reaches everyone; inbox listeners trimmed | B1–B4 | P2 | depends on SPENDLY-222 C4b |
| 12 | Fee intelligence and ledger health as server-stored results | E1, E2 | P3 | new data; last |

Each story is approved one at a time (docs/AGENT_WORKFLOW.md §3).

## Open questions for the owner
1. Should **SIPs be auto-posted** on the server (story 4)? Today they post only when the user presses the button.
2. **The on-device copy (C4):** keep it as the offline source, or narrow it once screens read stored results?
3. **Hourly vs daily** for subscription auto-post: daily at 05:30 IST is cheapest, and hourly posts closer to the due time.
