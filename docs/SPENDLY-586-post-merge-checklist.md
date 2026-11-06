# SPENDLY-586 — after the epic merges to main: what makes it work

**The rule (the user, 2026-11-03/04):** the epic merges to `main` only once **every** story is merged into the epic branch `feature/SPENDLY-586-supabase-first-reads`. There is no Android or web release before that. This file lists everything that has to happen **after** that merge, in order, for the feature to work.

Each story that merges into the epic adds its own steps here.

Last updated: 2026-11-06. **On main** (PR #259, `b76e16a1`, 2026-11-05); the epic and its 24 stories are Done. Harness D1–D11: 11/11 passed (`docs/SPENDLY-601-drill-log.md`); signed off by the user.

**Progress after the merge (2026-11-06):**

| Step | State |
|---|---|
| 1. Index deploy | ✅ 2026-11-05: dry run, then deploy (the "Deploy Firestore rules" runs with `deploy_indexes`) |
| 3. Web deploy | ✅ 2026-11-05 |
| 4. Expense release | ✅ v5.2.0 (build 134). The first attempt failed only because version 5.0.1 was below 5.1.1 |
| 5. Backfill | ✅ The nightly full run of 2026-11-06 (sync run 47): 5,340 reads, 254 upserts, 0 failures. ⏳ A manual `mode = verify` is still due: the nightly verify stopped at its 1,000-read budget |
| 6. `clientWrites` | ✅ On (user, 2026-11-06). The push copies saves in about 20 s. The direct write still needs confirming with the step 6 check below (SPENDLY-689) |

---

## 1. The stories (21)

| # | Story | In the epic? | What the merge to main still needs |
|---|---|---|---|
| 1 | SPENDLY-587 ADR v2 + rules + spike | ✅ merged | Nothing |
| 2 | SPENDLY-588 read inventory | ✅ merged | The 7-day console baseline after the release (§4 step 10) |
| 3 | SPENDLY-669 `rm_client_apply` RPC | ✅ merged | Nothing more; its migration is applied |
| 4 | SPENDLY-670 on-device outbox | ✅ merged | Release, then the `clientWrites` switch (§4 steps 5–7) |
| 5 | SPENDLY-671 route direct writers | ✅ merged | Ships with the release |
| 6 | SPENDLY-589 Wave 2 sync | ✅ merged | Backfill and the 14-day parity gate |
| 7 | SPENDLY-590 Wave 3 sync | ✅ merged | Backfill and the 14-day parity gate |
| 8 | SPENDLY-591 remaining collections | ✅ merged | Backfill and the 14-day parity gate |
| 9 | SPENDLY-592 money summaries | ✅ merged | Backfill and the 14-day field-parity gate |
| 10 | SPENDLY-672 sync safety net | ✅ merged | **Index deploy**, then the `safety-net` switch (§4 steps 1 and 8) |
| 11 | SPENDLY-593 realtime | ✅ merged (`f138e130`) | Migration `20261104000000` **applied 2026-11-04**; `readModel.realtime = true` **after 594 ships**; the hosted RS256 Realtime check; message volume (§4 step 9a) |
| 12 | SPENDLY-594 on-device SQLite copy | ✅ merged | **`expo-sqlite` = a new native build** (§4 step 4); `readModel.localCopy = true` with or before realtime (§4 step 9a); airplane drill and phone measurement after 673 |
| 13 | SPENDLY-673 read store + provider switch | ✅ merged | Per-collection `readModel.<collection>` switches (§4 step 9); 7 collections wired (bills, borrowings/receivables + repayments, budgets, investments); the rest in 596–599/674 |
| 14 | SPENDLY-595 Supabase plan: **Free** | ✅ merged | Migration `20261105000000` **applied 2026-11-05** (capacity reading); health shows database size and realtime messages against the Free limits (§4 step 2); monthly dashboard check of egress and connections |
| 15 | SPENDLY-596 Journal on the read model | ✅ merged | `readModel.expenses` / `readModel.incomes`: shadow 7 days, then supabase (§4 step 9) |
| 16 | SPENDLY-597 accounts, cards, bills | ✅ merged | `readModel.accounts` / `accountTypes` / `accountPayments` / `accountEntries` / `accountTransfers` (+ `creditCardBills`): shadow 14 days to the paisa (Free plan: health's capacity checks green), then supabase; the bill pass verifies on Firestore (a few reads per focus when it has work) |
| 17 | SPENDLY-598 investments, EPF, loans, subs | ✅ merged (`d5df3467`) | No migration. Per collection: shadow 14 days (zero differences), then supabase: portfolio, SIP, subscriptions, watchlists (+items), EPF passbook (`epfContributions`, `epfEstablishments`, `epfInterestEntries`, display-only callers). EPF transfers/reconciliations/wage history/profile stay on Firestore |
| 18 | SPENDLY-599 dashboard, net worth, budgets | ✅ merged (`61eaad6b`) | No migration. `financialSummaries`, `netWorthHistory`, `financialGoals` (§4 step 9): 14-day shadow, zero differences on every tile; goals last; offline expense drill |
| 19 | SPENDLY-674 reference data | ✅ merged (`1be425b6`) | No migration. `categories`, `spaces`, `categorizationRules`, `calendarReminders` (§4 step 9): 7-day shadow; launch reads measured (588 meter); palette no-flash check on device. Settings doc, `merchantOverrides`, `recurringDismissals` stay on Firestore |
| 20 | SPENDLY-600 listeners off + measure | ✅ merged (`58819b5d`) | No migration. Every listener on a migrated collection is gated (test); measure each flip 7 days before/after (step 10) and record it in the tracker |
| 21 | SPENDLY-601 drills + readiness review | ✅ merged (0bc47961) | No migration. Run the harness D1–D11 (`run_drills.sh`, needs PostgREST) and paste results into `docs/SPENDLY-601-readiness-review.md` §3; user sign-off; emergency rollback = `readmodel-set-mode.ts --switch=localCopy --value=false --apply` |
| 22 | SPENDLY-679 spaces/trips dual-write gap + per-site guard | ✅ merged (`18f53918`) | Spaces and trips saves skip Supabase; trip edits don't stamp `updatedAt` |
| 23 | SPENDLY-680 server writers don't push (EPF cron, admin scripts, legacy-site crons) | ✅ merged (`8d49dace`); legacy crons: retire (user, 2026-11-05); rebuilt in-repo by SPENDLY-682 | Cron changes reach Supabase only nightly |
| 24 | SPENDLY-681 safety-net blind spot for `*Ms`/`at`-stamped collections | ✅ merged (`4124a2be`, option A) | **Must be done before** `READMODEL_NIGHTLY_MODE=safety-net` |

SPENDLY-662 (the push fix, P0) is already on `main` and Done.

---

## 2. What differs from `main` today (epic `4f6d533b` vs `main` `d670fc78`)

| Area | Change | Live already? | Action after the merge |
|---|---|---|---|
| Supabase migrations | `20261030000000` (RPC) through `20261105000000` (capacity), 9 files | **Yes, applied to production** with approval as each story merged | Confirm with a dry run that nothing is pending |
| `firestore.indexes.json` | +96 collection-group field overrides (672), +24 for the `*Ms`/event-time change fields (681): 122 of Firestore's 200 | **No** | Deploy manually (§4 step 1) |
| `netlify/functions/readmodel-push.ts` | Nested, root and excluded-doc refs (591/592) | **No** | **Netlify deploy** of the function (§4 step 3) |
| `.github/workflows/readmodel-*.yml` | Nightly mode, health, schema | Take effect on merge | None: the default `full` keeps today's behaviour |
| App code (outbox, write hooks, mappings) | 670/671/589–592 | **No** | **Expense release** (§4 step 4) |
| `firestore.rules`, `storage.rules` | No change | — | None |
| `package.json` (native modules) | **`expo-sqlite` ~57.0.4** (594); `fake-indexeddb` (dev only) | — | **A native Android/iOS build**: the Expense release must rebuild (prebuild), not an OTA/JS-only update |

---

## 3. Before the merge (the gate)

- [ ] Every one of the 21 stories is merged into the epic.
- [ ] `main` is merged into the epic and conflicts are resolved; PR Checks and Read-model schema are green on the epic head.
- [ ] `npm test`, `npm run test:rules` and `npx tsc --noEmit` pass locally.
- [ ] `npx supabase db push --linked --workdir supabase-readmodel --dry-run` shows **nothing pending**, or only migrations already approved.
- [ ] A read-only index diff: `firebase firestore:indexes --project expenseapp-27f94 > live.json`, then `node scripts/firestoreRulesCi.js diff-indexes --repo firestore.indexes.json --live live.json`. It must show only the 672 and 681 overrides as new, and nothing live missing.
- [ ] Open the epic PR to `main` and get the user's approval to merge.

---

## 4. After the merge, in this order

Every production step below needs the user's approval when it happens. Dry runs come first.

### Step 1: Deploy the collection-group indexes (672, 681)

- **How:** the "Deploy Firestore rules" workflow (`firestore-rules-deploy.yml`) with `deploy_indexes = true`, dry run first, then for real. It refuses a deploy that would delete live indexes.
- **Wait:** until every index is **Enabled** in the Firebase console (Firestore → Indexes → Single field / Exemptions).
- **Why now:** the daily "Live vs repo drift" job fails while the repo and live indexes differ.
- **Rollback:** not normally needed; unused indexes are harmless.

### Step 2: Confirm the database

- [ ] `supabase db push --dry-run`: nothing pending.
- [ ] Health (`readmodel-health.yml`, run it manually): OK, including the Free plan's capacity rows (database size, realtime messages).

### Step 3: Deploy the read-model push function (Netlify)

`netlify/functions/readmodel-push.ts` changed: it now handles nested watchlist items, `users/{uid}` settings and the skipped summary docs. Without this deploy, those pushes are refused ("Not a pushable document"), and only the nightly run copies them.

- **How:** the "Deploy Web" workflow. *(The user is low on Netlify credits, so this is the user's call; but the feature needs it.)*
- **Check:** save a watchlist item, then confirm a `push_daily` row and a `watchlist_items` row within seconds.

### Step 4: Ship the Expense release (app code)

- **How:** the Expense release workflow.
- **What it carries:** the outbox (670), the write hooks (671), the mappings for every synced collection, and **the `expo-sqlite` native module (594)**. So it must be a full native build: prebuild regenerates `android/`, so back up and restore the release signing; see the memory note about prebuild.
- **Why it's safe while switched off:** without `clientWrites` the outbox stays off, so the app keeps writing only Firestore, plus the push.
- **Check:** device QA on Spendly Test (the emulator, never the real app). Add, edit and delete across expenses, bills, loans, EPF, investments, a watchlist item and the theme setting.

### Step 5: Backfill (first copy of everything synced since 589)

1. Read-model sync workflow, `mode = full`, `dry_run = true`. Record the reads and the per-collection document counts.
   - With 53 collections, one full pass is about 5,300 reads. The per-run budget is 6,000 and the daily budget 12,000.
   - A pass that hits the budget stops with `resumeFrom`; the next run continues.
2. **Get the user's approval** (READ_MODEL_RULES R7.2).
3. `mode = full`, `dry_run = false`.
4. `mode = verify`: count parity must pass for every (user, collection).

### Step 6: Turn on the app's direct writes (670)

- **How:** in the Firebase console, `system_settings/global` → `readModel` → set `clientWrites = true`.
- **Check:**
  - **The direct write (until SPENDLY-689 ships):**
    1. On the **web app**, open DevTools (F12) → **Network**, and filter on `rm_client_apply`.
    2. Save something.
    3. A `rm_client_apply` request with status **200** within about 2 s means the direct write works.
    4. No request means the app isn't sending: check the build's read-model settings, and reload. A 4xx or 5xx response means a problem; look at its Response tab.
  - **Do not use** `count(*) where written_by = 'client'`, or health's "App direct writes in 24 h", as proof. The server push replaces each client row with Firestore's version (`written_by = 'server'`) within seconds, so both read about 0 even when everything works. SPENDLY-689 adds a database counter for this.
  - **The push:** `push_daily` counts requests and docs, with 0 rejected and 0 failed. The saved row is in Supabase within about 30 s.
  - **Divergences in 24 h** stays at 0.
- **Rollback:** set `clientWrites = false`. The push and the nightly sync carry on as before.

### Step 7: Parity gates start

- **Field parity at 0:**
  - **14 days:** the money tables (Wave 2/3, 591's SIP/trips/budgets, 592's `financial_summaries`);
  - **7 days:** the rest.
- **Watch it:** with the Read-model sync workflow in `report` mode (the 14-day gate report) and the nightly health.

### Step 8: Switch the nightly run to the safety net (672)

Only after step 1 (indexes Enabled) and step 6 (app writes live and divergences at 0).

1. Manual Read-model sync, `mode = nightly`, `dry_run = true`, with `READMODEL_NIGHTLY_MODE=safety-net` set for the test. Expect about 450 reads, and `crossUserCollections` about 48.
2. Set the repository variable `READMODEL_NIGHTLY_MODE = safety-net`. Optionally set `READMODEL_DIVERGENCE_WARN` (default 0).
3. **Acceptance:** for 7 days, `sync_runs.reads_used` stays under 1K on changed-only nights, and divergences stay at 0. The Sunday full pass runs count parity.

**Rollback:** clear the variable, or set it to `full`.

### Step 9a: Turn on the local copy (594) and realtime (593)

1. In the Supabase dashboard (Realtime settings), check that private channels require authorization.
2. In the Firebase console, `system_settings/global` → `readModel` → set `localCopy = true`, then `realtime = true`. The copy hydrates on each device's next start: about 21 MB and a few seconds for a 30K-transaction user.
3. Measure the hydration time and database size on a phone for the heaviest user (594 acceptance).
4. **Check:** a save on device A shows on device B within 10 s; a soft delete disappears on B.
5. Count messages for a week (runbook, "Realtime"), against the plan limits.

**Rollback:** set `realtime = false` and/or `localCopy = false`. With the copy off nothing is opened; sign-out still wipes any copy left on the device.

### Step 9: Collection and screen switches (673; then 596–599, 674)

Each wired collection has `system_settings/global.readModel.<collection>`:
- first set it to `shadow`, and watch `readModel.shadow.<collection>` (none means equal);
- after the shadow period (7 days, 14 where money is shown) and the user's approval, set it to `supabase`.

It needs `readModel.localCopy = true` (step 9a). Wired by 673: `creditCardBills`, `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments`, `categoryBudgets`, `investments`. Wired by 596: `expenses`, `incomes` (the Journal's live window; 7-day shadow). Wired by 597: `accounts`, `accountTypes`, `accountPayments`, `accountEntries`, `accountTransfers` (14-day shadow, to the paisa). Wired by 598: `holdings`, `investmentCashTransactions`, `portfolioSettings`, `portfolioTransactions`, `sipPlans`, `virtualPositions`, `sipTransactions`, `subscriptions`, `watchlists`, `watchlists/items`, and for display-only EPF callers `epfContributions`, `epfEstablishments`, `epfInterestEntries` (14-day shadow). Wired by 599: `financialSummaries` (tiles + EPF summary), `netWorthHistory`, `financialGoals` (14-day shadow; goals last).

**Rollback:** `firestore`.

Wired by 674: `categories` (the revision listener stays for firestore mode), `spaces`, `categorizationRules`, `calendarReminders` (7-day shadow). The `users/{uid}` settings document, `merchantOverrides` and `recurringDismissals` stay on Firestore.

Each screen has `system_settings/global.readModel.<screen>`: `firestore` → `shadow` → `supabase`. Shadow lasts 7 days, or 14 where money is shown, and the user approves each flip. The project stays on the Free plan (595): before each flip, health's capacity checks are green.

### Step 10: Measure (588, 600)

- 588: the 7-day Firebase console read baseline after the release.
- 600: listeners are already off in `supabase` mode (`listenersOff.test.ts`). For each flip in step 9:
  1. Baseline: 7 days of console reads per day, plus a 588-meter lab launch.
  2. Flip, with the user's approval.
  3. After: 7 days, and the same lab run.
  4. Record both in the tracker's "Read savings" table.
- Order, largest first: categories, the Journal window, the account ledger, tiles and summaries, portfolio and EPF, then the rest.
- The nightly sync: `READMODEL_NIGHTLY_MODE=safety-net` (672) once the dual write is live.

---

## 5. Jira

- **The Done rule** (AGENT_WORKFLOW §4): a story moves to **Done** when its changes reach `main`. Comment on each with the merge commit, the doc, and anything left over, naming the ticket that carries it.
- **What's left over after the merge:**
  - 589/590/591/592: the parity gates;
  - 672: the switch and its 7-day measurement;
  - 588: the baseline;
  - 670: the switch.

  If a story's leftovers must be tracked separately, open a follow-up ticket.

## 6. Rolling back after the merge

Every step is a switch. None needs a release.

| What | Back to today |
|---|---|
| App direct writes | `readModel.clientWrites = false` |
| Nightly safety net | `READMODEL_NIGHTLY_MODE` unset or `full` |
| A screen on Supabase | `readModel.<screen> = firestore` |
| Per-write push | Not a switch: it runs while the Netlify function has its read-model environment variables. Redeploying the previous function version undoes step 3 |

Firestore stays the source of truth throughout. Supabase can be rebuilt from it with a full sync.
