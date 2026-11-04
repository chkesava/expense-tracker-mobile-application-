# SPENDLY-586 — after the epic merges to main: what makes it work

**The rule (the user, 2026-11-03/04):** the epic merges to `main` only once **every** story is merged into the epic branch `feature/SPENDLY-586-supabase-first-reads`. There is no Android or web release before that. This file lists everything that has to happen **after** that merge, in order, for the feature to work.

Each story that merges into the epic adds its own steps here.

Last updated: 2026-11-04, with 11 of 21 stories merged (593 added).

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
| 12 | SPENDLY-594 on-device SQLite copy | 🔄 built, awaiting merge | **`expo-sqlite` = a new native build** (§4 step 4); `readModel.localCopy = true` with or before realtime (§4 step 9a); airplane drill and phone measurement after 673 |
| 13 | SPENDLY-673 read store + provider switch | ⏳ to do | *(added when merged)* |
| 14 | SPENDLY-595 Supabase plan (Pro) | ⏳ to do | *(added when merged: Pro before any money screen flips)* |
| 15 | SPENDLY-596 Journal on the read model | ⏳ to do | *(added when merged: 7-day shadow)* |
| 16 | SPENDLY-597 accounts, cards, bills | ⏳ to do | *(added when merged: 14-day shadow)* |
| 17 | SPENDLY-598 investments, EPF, loans, subs | ⏳ to do | *(added when merged: 14-day shadow)* |
| 18 | SPENDLY-599 dashboard, net worth, budgets | ⏳ to do | *(added when merged: 14-day shadow)* |
| 19 | SPENDLY-674 reference data | ⏳ to do | *(added when merged: 7-day shadow)* |
| 20 | SPENDLY-600 listeners off + measure | ⏳ to do | *(added when merged)* |
| 21 | SPENDLY-601 drills + readiness review | ⏳ to do | *(added when merged)* |

SPENDLY-662 (the push fix, P0) is already on `main` and Done.

---

## 2. What differs from `main` today (epic `4f6d533b` vs `main` `d670fc78`)

| Area | Change | Live already? | Action after the merge |
|---|---|---|---|
| Supabase migrations | `20261030000000` (RPC) through `20261103000000` (summaries), 7 files | **Yes, applied to production** with approval as each story merged | Confirm with a dry run that nothing is pending |
| `firestore.indexes.json` | +96 collection-group field overrides (672) | **No** | Deploy manually (§4 step 1) |
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
- [ ] A read-only index diff: `firebase firestore:indexes --project expenseapp-27f94 > live.json`, then `node scripts/firestoreRulesCi.js diff-indexes --repo firestore.indexes.json --live live.json`. It must show only the 672 overrides as new, and nothing live missing.
- [ ] Open the epic PR to `main` and get the user's approval to merge.

---

## 4. After the merge, in this order

Every production step below needs the user's approval when it happens. Dry runs come first.

### Step 1: Deploy the collection-group indexes (672)

- **How:** the "Deploy Firestore rules" workflow (`firestore-rules-deploy.yml`) with `deploy_indexes = true`, dry run first, then for real. It refuses a deploy that would delete live indexes.
- **Wait:** until every index is **Enabled** in the Firebase console (Firestore → Indexes → Single field / Exemptions).
- **Why now:** the daily "Live vs repo drift" job fails while the repo and live indexes differ.
- **Rollback:** not normally needed; unused indexes are harmless.

### Step 2: Confirm the database

- [ ] `supabase db push --dry-run`: nothing pending.
- [ ] Health (`readmodel-health.yml`, run it manually): OK.

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
- **Check within a day:**
  - rows with `written_by = 'client'` appear: `select count(*) from expenses where written_by = 'client'`;
  - the health summary shows "App direct writes in 24 h" above 0;
  - "Divergences in 24 h" stays at 0.
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

### Step 9: Screen switches (596–599, 674): to be completed when those stories merge

Each screen has `system_settings/global.readModel.<screen>`: `firestore` → `shadow` → `supabase`. Shadow lasts 7 days, or 14 where money is shown, and the user approves each flip. Supabase Pro (595) comes before the first money screen.

### Step 10: Measure (588, 600)

- 588: the 7-day Firebase console read baseline after the release.
- 600: turn listeners off per collection, and measure 7 days before and after.

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
