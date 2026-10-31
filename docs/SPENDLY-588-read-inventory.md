# SPENDLY-588 — Firestore read inventory

| | |
|---|---|
| Epic | SPENDLY-586 (Supabase-first reads); feeds the ADR `docs/SPENDLY-586-adr.md` (D5, D7) |
| Branch | `feature/SPENDLY-588-read-inventory` |
| State (2026-10-31) | **Tooling and the code-derived inventory are done. The lab measurements (§4) and the console baseline (§5) are pending:** they need a person to run them, and the console baseline needs the 633 release on devices for 7 days |

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
| Cold reads | The first server snapshot of each listener, billed as a brand-new query: one read per document, at least 1. This is a launch **more than 30 minutes** after the last |
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

## 4. Lab runs (pending; protocol)

**Setup:**
- Spendly Test on the Firebase emulator (`docs/LOCAL_TEST_MODE.md`): `npm run emulators:local`, then `npm run emulators:seed`.
- Run Expo web (`npm run web`, a dev build, so the meter is on), sign in as `demo@spendly.test`.
- Optionally repeat on a phone with a perf build (`EXPO_PUBLIC_PERF_MARKS=1`), never the real app (`docs/AGENT_WORKFLOW.md` §7).

**Scenario.** In the console, run `spendlyReadInventory.reset()` before each step and `spendlyReadInventory.table()` after it:

| Step | Action | Measures |
|---|---|---|
| A | Hard reload (cold launch) → wait for the dashboard to settle, ~10 s | launch + dashboard; the **cold reads** column is a >30 min launch |
| B | Reload again within 1 minute | the **warm reads** column (with the IndexedDB cache) |
| C | Journal → scroll one page → Insights → Accounts → a card → back to the dashboard | per-screen additions |
| D | Leave the app idle for 10 minutes | steady-state update reads (should be ~0) |
| E | Add one expense; edit it; delete it | update reads caused by own writes |

**Results:** to be filled in from the runs. Paste each table under its step.

| Step | Total cold | Total warm | Update | Get reads | Top 3 collections |
|---|---:|---:|---:|---:|---|
| A | — | — | — | — | — |
| B | — | — | — | — | — |
| C | — | — | — | — | — |
| D | — | — | — | — | — |
| E | — | — | — | — | — |

**Scaling note:** the seed has 1 user and small collections. To estimate production per-user cost, scale each row by its production document count (494 inventory, 2026-10-17: e.g. `expenses` 1,352 across 12 users, so the 300 cap binds for heavy users; `categories` 2,090 across 11 users).

## 5. Production baseline (pending)

The Firebase console → Firestore → Usage, as a 7-day export:

| Window | Reads/day (average) | Peak | Note |
|---|---:|---:|---|
| 2026-10-10 → 10-17 | ≈ 22.7K | ≈ 44K | before 501 and 633 (494 ADR §2) |
| after 633 has been on devices for 7 days | — | — | **the ADR D5 baseline**; the D7 threshold is ≥ 15K/day |

## 6. Findings from the code inventory

| # | Finding | Effect | Rank | Proposed handling |
|---|---|---|---|---|
| F1 | **`services/portfolio/holdingAdjustments.ts:12` reads `portfolioSettings/main`**, while every other portfolio path uses `portfolioSettings/config` (`hooks/usePortfolio.ts:66`, `services/portfolio/investmentCash.ts:62`) | Holding adjustments may read or write a settings document nobody else reads. **Not verified at runtime** | P1 (possible money-path bug; outside 588) | New ticket; ask the user. Related to SPENDLY-498 (holding adjustments) |
| F2 | `calendarReminders` is listened to twice at launch with the same query (`CalendarNotificationSync`, `RemindersInboxProvider`), and the hook's comment says "calendar screens only" | Probably billed once (the SDK shares identical targets), but 600 must remove both | P3 | Note it for 600; fix the comment |
| F3 | `lib/ensureCategoryHierarchy.ts:310` reads the **whole** `expenses` collection, unmetered, when the category stamp is stale | A full-ledger read for heavy users, on a migration that is rare but unbounded | P2 | Now metered by this story; bounding it is a separate fix |
| F4 | Unbounded launch listeners: `categoryBudgets`, `accountPayments`, `accountEntries`, `accountTransfers`, the borrowings/receivables group, `creditCardBills`, `calendarReminders`, `investments`, `holdings`, `investmentCashTransactions`, `netWorthHistory` (12 months) | Cost grows with history on every cold launch | P2 | Candidates for **plain Firestore bounds** (as SPENDLY-406/501 did), which cut reads without the read model |
| F5 | Dead code: `listAccountReconciliations`, `listWhatIfScenarios`, `getWhatIfScenario` have no callers | none | P3 | Leave it; note it for cleanup |
| F6 | `expenses`/`incomes` (newest 300) feed about 10 consumers through `FinanceDataProvider` | 600 can remove them only after **all** of them are migrated (Journal, Dashboard, Insights, forms, Runway, Calendar, recurring sync, SetupProgress) | — | Recorded as a 600 constraint |

## 7. Provisional migration order (code-based; confirm with §4 and §5)

1. **`expenses` + `incomes` window (596):** the largest bounded launch cost (up to 600 docs cold), but blocked by F6. Its savings arrive only when every consumer is migrated.
2. **Account sub-collections + `creditCardBills` (597):** unbounded, already synced (Wave 1), with balances copied (592).
3. **Dashboard summaries + `categoryBudgets` (599/591):** `categoryBudgets` is unbounded and unsynced.
4. **Investments/portfolio (598, needs 590).**

**Alternative the ADR should weigh:** F4's Firestore-only bounds could reach a similar launch saving with none of the read-model work. It is cheaper and keeps offline and realtime intact.
