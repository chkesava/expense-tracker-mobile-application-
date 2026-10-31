# SPENDLY-588 — Firestore read inventory

| | |
|---|---|
| Epic | SPENDLY-586 (Supabase-first reads); feeds the ADR `docs/SPENDLY-586-adr.md` (D5, D7) |
| Branch | `feature/SPENDLY-588-read-inventory` |
| State (2026-10-31) | **Tooling, code inventory and lab run are done** (§4, `docs/SPENDLY-588-lab-2026-10-31.md`). **Pending: the production console baseline (§5)**, which needs the 633 release on devices for 7 days |

## 1. Why, and the method

Read savings in SPENDLY-586 only come from **not attaching** Firestore listeners (story 600). This report shows which reads cost what, so the ADR can set a target and an order.

The method follows ADR D5 and **differs from the Jira text**, which asked for a week of sampled production telemetry. Production telemetry has nowhere to go:
- the app may not write to Supabase (READ_MODEL_RULES R1.1);
- there is no analytics vendor (`lib/shortcutTelemetry.ts` is console-only);
- a Netlify collector costs credits.

Instead, three sources:
1. **Code inventory (§3):** every read call site, with what mounts it and when. Done.
2. **Lab runs (§4):** a scripted session on Spendly Test, measured by the new read meter. Pending.
3. **Production total (§5):** the Firebase console's 7-day Firestore reads, exported by the user. Pending.

## 2. Tooling (this story's code)

**`lib/firestoreReadMeter.ts`** wraps `onSnapshot`, `getDoc` and `getDocs` in the one Firestore import path, `@/lib/firestore` (web) and `lib/firestore.native.ts` (Android/iOS). Every app read is metered, including the ~30 hooks that never called `logQuerySnapshot`.
- **When it runs:** only in dev and perf builds (`__DEV__` or `EXPO_PUBLIC_PERF_MARKS=1`), never under vitest. Otherwise `meterReads` returns the SDK's own functions, so production code is unchanged by construction. A test pins this: "is off under vitest, so every test keeps the SDK's own functions".
- **Failure handling:** a metering error is swallowed; the read always proceeds.

**`shared/utils/readInventory.ts`** is a pure accumulator that applies Firestore's billing rules (firebase.google.com/docs/firestore/pricing):

| Column | Meaning |
|---|---|
| Cold reads | Each listener's first result, billed as a brand-new query: one read per document, at least 1. This is a launch **more than 30 minutes** after the last. The size is taken from the cache snapshot when the server sends nothing new: the SDK skips metadata-only snapshots, but the server still bills the re-query (a lab dry run showed the earlier server-snapshot-only rule undercounting 464 → 157) |
| Warm reads | The same snapshot billed as changes only. This is a relaunch **within 30 minutes**, with the persistent cache (633) |
| Update reads | Later server snapshots: the changed documents. This device's own pending-write echoes and cache-only snapshots aren't billed |
| Gets / Get reads | `getDoc`/`getDocs` answered by the server |
| Cache docs | Documents served from the local cache (free) |

- **Keys never hold ids:** every document segment becomes `*`, so `users/{uid}/expenses` is reported as `users/*/expenses`.
- **Console:** `spendlyReadInventory.table()` prints a markdown table, `.rows()` returns the rows, `.reset()` starts a new window.

**Known limits:**
- **Identical listeners are counted per listener.** Two components listening with the same query (e.g. `calendarReminders`, §6) are billed once by the SDK, which shares the watch target, but metered twice. A row with `open > 1` flags this.
- **Transaction reads** (`runTransaction`, 4 write-path files) aren't metered. Writes are ~150/day in production, so this is negligible.
- **The SDK query path** is read from internals (`_query.path` on web, `_collectionPath` on native). If either changes, rows fall back to the first document's parent path.

## 3. Code inventory (2026-10-31, `main` `ac108974`)

It covers the Expense product only; Ganesh and Nutrition are excluded. The full file:line table is in `docs/SPENDLY-588-read-callsites.md`. The classes:

| Class | Call sites | Notes |
|---|---:|---|
| **LAUNCH**: every signed-in cold start | 29 | 4 root documents, 7 `FinanceDataProvider` listeners, reference data, ref-counted dues listeners started by `RemindersInboxProvider` when idle, and the category migration's stamp check |
| **DASHBOARD**: the default home route | 11 | summaries, EPF summary, net-worth history, budgets, investments, portfolio |
| **SCREEN**: only when a screen opens | ~45 | EPF, SIP, portfolio detail, decisions, fees, goals, runway, ledger audit, history pages, vaults/splits/trips |
| **WRITE-PATH**: inside a save, delete or repair | ~40 | guards, idempotency checks, the manual summary rebuild |

### 3.1 What a cold launch reads (LAUNCH + DASHBOARD)

These are what 600 would have to switch off to save reads at launch:

| Collection | Bound | Mount | Consumers (all must be migrated before 600 removes it) |
|---|---|---|---|
| `expenses` | newest 300 | shell, immediate | Dashboard, Journal, Insights, transactions, forms, drilldowns, Runway, Calendar, SetupProgress, recurring sync |
| `incomes` | newest 300 | shell, immediate | same |
| `accounts`, `accountTypes` | unbounded | shell, immediate | net worth, Ledger accounts and cards, account detail, every form, reminders |
| `accountPayments`, `accountEntries`, `accountTransfers` | unbounded | shell, idle | net worth, account detail, Runway, fees, decisions |
| `categories` | 500 | shell, idle | pickers, forms, settings |
| `subscriptions` | 200 | shell, immediate (auto-posts due subscriptions) | dashboard widget, recurring, Calendar, reminders, Runway |
| `spaces`, `categorizationRules` | 200 / 500, one-shot | shell, idle, plus foreground refresh after 5 min | forms, vaults |
| `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments` | unbounded | ref-counted; first subscriber `RemindersInboxProvider`, idle | reminders, Ledger, net worth, forms, Calendar, Runway |
| `creditCardBills` | unbounded | same | reminders, cards, bills, forms, net worth |
| `calendarReminders` | unbounded | `CalendarNotificationSync` (immediate) **and** `RemindersInboxProvider` (idle) | notifications, reminders bell, Calendar |
| `financialGoals` | unbounded | ref-counted; launch only with the Save Goals flag on | goals, dashboard widget |
| `recurringDismissals` | unbounded, one-shot | after the ledger page is complete | recurring suggestions |
| `system_settings/global`, `users/{uid}`, `latest_release_*` | documents | root | gates, settings, update prompt |
| `financialSummaries/dashboard_*` | 6 months | Dashboard | tiles, cash-flow chart |
| `financialSummaries/epf` | document | Dashboard net worth | net worth, EPF |
| `netWorthHistory` | 12 months | Dashboard | net-worth widget |
| `categoryBudgets` | **unbounded** | Dashboard spending card | budgets, spending, reminders |
| `investments`, `holdings`, `investmentCashTransactions`, `portfolioSettings/config` | unbounded | Dashboard net worth, idle | net worth, investments |
| `merchantOverrides` | unbounded, one-shot | Dashboard recent activity | merchant names |

**Read-model coverage of this set today:** only Wave 1 (`expenses`, `incomes`, `accounts`, `accountTypes`, `accountPayments`, `accountEntries`, `accountTransfers`, `creditCardBills`, `categories`) plus `financialGoals`. Everything else is in no wave yet (589–592). `notifyReadModelSnapshot` runs only on the 7 `FinanceDataProvider` listeners, `categories` and `creditCardBills`.

## 4. Lab run (2026-10-31)

**How it ran:**
- `scripts/read-inventory-lab.js` drove Spendly Test on Expo web (dev build of the 588 branch) against the Firebase emulator, with headless Chrome. No production system was touched.
- The seed was 129 expenses, 4 incomes, 4 accounts, 3 subscriptions, 2 goals, 3 holdings and 4 budgets. The app adds 287 categories itself at first sign-in.
- Full tables: `docs/SPENDLY-588-lab-2026-10-31.md`. To repeat it, see the header of the script.

**Results (billed reads):**

| Step | What | Cold (> 30 min) | Warm (< 30 min) | Updates | Gets | Main contributors |
|---|---|---:|---:|---:|---:|---|
| A0 | First launch on an empty cache: sign in → dashboard | 465 | 448 | 0 | 5 | `categories` 287, `expenses` 129 |
| A | Relaunch → dashboard (cache present) | **464** | **1** | 0 | 5 | `categories` 287 (62%), `expenses` 129 (28%), all others ≤ 5 each |
| B | Reload within a minute | 464 | 1 | 0 | 5 | the same |
| C | Money (Journal/Ledger) tab | 0 | 0 | 0 | 0 | everything comes from the launch listeners |
| C | Analytics tab | 1 | 0 | 0 | 0 | `feeReviews` (empty) |
| C | Investments tab | 1 | 0 | 0 | 0 | a second `investments` listener |
| C | Vaults tab | 1 | 0 | 0 | 0 | top-level `vaults` (empty) |
| C | Back to the dashboard, the cards view | 0 | 0 | 0 | 0 | — |
| D | Idle 5 minutes | 0 | 0 | 0 | 0 | — |
| E | One expense written by another device | 0 | 0 | **1** | 1 | the `expenses` listener (1); `recurringDismissals` re-checked (1 get) |

**What this means:**
1. **Almost every read happens at launch.** Navigating between screens and idling cost ~0. A screen migrated to Supabase saves reads only if its launch listeners can be switched off (600), and those live in shared providers (F6).
2. **The cost of a launch depends on how long since the last one.** Within 30 minutes it is ~1 read (633's persistent cache works). After 30 minutes it is the full result of every launch listener: 464 here.
3. **`categories` is the single biggest item** (F7). It's a near-static catalogue of 287 documents per user (production: 2,090 across 11 users, ≈ 190/user), re-read in full on every cold launch.
4. **Realtime updates are cheap:** one changed document costs one read.

**Production estimate per cold launch, per user** (E, using the 494 inventory):
- `categories` ≈ 190;
- `expenses` + `incomes`: up to 300 each (the 300 cap binds for heavy users; average ≈ 113 expenses and ≈ 4 incomes);
- everything else ≈ 30–60.

So it is **≈ 350 for an average user** (190 + 113 + 4 + ~45) **and up to ≈ 850 for a heavy one.**

**Consistency check:** production's ≈ 22.7K reads/day (Oct 10–17) across 24 users is ≈ 950 per user per day, which is about three cold launches each. That is plausible, so the model explains the production volume without any other large source.

## 5. Production baseline (pending)

The Firebase console → Firestore → Usage, as a 7-day export:

| Window | Reads/day (average) | Peak | Note |
|---|---:|---:|---|
| 2026-10-10 → 10-17 | ≈ 22.7K | ≈ 44K | before 501 and 633 (494 ADR §2) |
| after 633 has been on devices for 7 days | — | — | **the ADR D5 baseline**; the D7 threshold is ≥ 15K/day |

## 6. Findings from the code inventory

| # | Finding | Effect | Rank | Proposed handling |
|---|---|---|---|---|
| F1 | `services/portfolio/holdingAdjustments.ts:12` reads `portfolioSettings/main`, while every other portfolio path uses `portfolioSettings/config` (`hooks/usePortfolio.ts:66`, `services/portfolio/investmentCash.ts:62`) | The document is only read, to check affordability. When it's missing, `ledgerCashForTrade` returns 0, so a missing acquisition funded from Investment Cash fails with "Insufficient cash balance". It fails closed and corrupts no data | P2 | **Already tracked: SPENDLY-527** (same diagnosis). No new ticket |
| F2 | `calendarReminders` is listened to twice at launch with the same query (`CalendarNotificationSync`, `RemindersInboxProvider`), and the hook's comment says "calendar screens only" | Probably billed once (the SDK shares identical targets), but 600 must remove both | P3 | Note it for 600; fix the comment |
| F3 | `lib/ensureCategoryHierarchy.ts:310` reads the **whole** `expenses` collection, unmetered, when the category stamp is stale | A full-ledger read for heavy users, on a migration that is rare but unbounded | P2 | Now metered by this story; bounding it is a separate fix |
| F4 | Unbounded launch listeners: `categoryBudgets`, `accountPayments`, `accountEntries`, `accountTransfers`, the borrowings/receivables group, `creditCardBills`, `calendarReminders`, `investments`, `holdings`, `investmentCashTransactions`, `netWorthHistory` (12 months) | Cost grows with history on every cold launch | P2 | Candidates for **plain Firestore bounds** (as SPENDLY-406/501 did), which cut reads without the read model |
| F5 | Dead code: `listAccountReconciliations`, `listWhatIfScenarios`, `getWhatIfScenario` have no callers | none | P3 | Leave it; note it for cleanup |
| F7 | **`categories` is ~62% of a cold launch in the lab** (287 docs; production ≈ 190/user). It is a near-static catalogue with a listener (`ExpenseReferenceDataProvider.tsx:265`, limit 500), re-read in full after every 30-minute gap | The largest single cold-launch cost | P2 | **A Firestore-only fix:** load once and refresh when a version stamp changes (the stamp `meta/categories` is already read at launch by `ensureCategoryHierarchy`), instead of a live listener. No read model needed |
| F6 | `expenses`/`incomes` (newest 300) feed about 10 consumers through `FinanceDataProvider` | 600 can remove them only after **all** of them are migrated (Journal, Dashboard, Insights, forms, Runway, Calendar, recurring sync, SetupProgress) | — | Recorded as a 600 constraint |

## 7. Recommended order (from §3 and §4; confirm the volume with §5)

**Firestore-only first.** These are cheaper than any read-model step, keep offline and realtime, and need no ADR "go":
1. **`categories` (F7):** a stamp-gated load instead of a listener. It saves up to ~60% of every cold launch.
2. **Bound the unbounded launch listeners (F4):** `categoryBudgets`, the account sub-collections, and the borrowings/receivables group. Today they are small, but they grow with history.

**Then, only if the post-633 baseline still justifies it (ADR D7):**

3. **The `expenses` + `incomes` window (596):** the largest remaining cold-launch cost (up to 600 docs), but its savings arrive only when every `FinanceDataProvider` consumer is migrated (F6, 600).
4. **Account sub-collections + `creditCardBills` (597):** small in reads; the value is consistency rather than savings.
5. **Dashboard summaries, budgets, investments (598/599):** a handful of reads each at launch. **The read savings don't justify their risk;** migrate them only for reasons other than reads.

**For the ADR:** the lab shows the epic's read savings sit almost entirely in two launch listeners (`categories`, `expenses`/`incomes`). One of them (`categories`) can be fixed without the read model.
