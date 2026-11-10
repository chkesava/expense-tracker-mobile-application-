# Spendly project context (for any coding agent)

This file gives any coding agent (Claude Code, Codex, Antigravity, Cursor, …) the working knowledge that used to live only in one agent's private memory: how the system is built today, the owner's standing rules, the traps already hit, and where things stand.

**Precedence:**
- `docs/AGENT_WORKFLOW.md` wins on process (branching, Jira, validation).
- `docs/READ_MODEL_RULES.md` wins on data rules.
- `CLAUDE.md` holds the full Spendly and Ganesh Seva rules.
- This file adds what those don't say.
- Trust the repo and Jira over the "Current state" section below; it is a snapshot.

Last refreshed: 2026-11-09.

---

## 1. Architecture today (what changed since October 2026)

| Piece | What it is |
|---|---|
| **App** | Expo SDK 57 + React Native + TypeScript, Expo Router, NativeWind, Gluestack wrappers in `components/ui` and `components/common`. One repo, three products: **Expense** (Spendly), **Nutrition**, **Ganesh Seva**. Keep every change inside its product. |
| **Firestore** | The **source of truth**. One Firebase project serves dev **and** prod (no staging). It is on the **Spark (free) plan**. |
| **Supabase** (`supabase-readmodel/`) | The **read model**: a copy of Firestore in Postgres, with RLS (owner-only SELECT). Firestore wins any difference. |
| **GitHub Actions** | All server jobs (the repo is public, so minutes are free): the read-model sync, the daily calculation jobs, push reminders, rules and index deploys, releases. |
| **Cloudflare Worker** | Triggers the scheduled GitHub workflows on time (GitHub cron runs late). Its `0 3 * * *` run is 08:30 IST. |
| **Cloudflare Pages** | A web backup: https://spendly-web-backup.pages.dev |
| **Netlify** | The main web host plus a few functions. **Credits are low**: see §3. |

### 1.1 Data flow (mandatory for every feature)
**Writes:**
- Firestore first, through `commitMutations` (the offline outbox).
- The app then also writes Supabase, **only** through the `rm_client_apply` RPC, from the on-device outbox.
- Server writers use `trackServerBatch` + `createServerPush`.
- Every write stamps `createdAt`/`updatedAt`.

**Reads:**
- Every screen reads through `useReadModelSource("<collection>")`. The mode comes from `system_settings/global.readModel`:
  - `firestore`: the default.
  - `shadow`: compares the two stores (on device only when `deviceShadow` is true).
  - `supabase`: reads the on-device copy, with no Firestore listener mounted.
- **The Firestore fallback must always stay.** "Reads come from Supabase" is the target mode, not permission to delete Firestore paths.
- History and report reads go through `lib/readModel/` (for example `readJournalMonth`).

**A new collection or field** needs all of the following in the same story:
- a `TableSpec` in `shared/utils/readModel/mapping.ts`;
- an additive Supabase migration with RLS;
- the `rm_client_apply` allowlist;
- the purge;
- the cross-user indexes;
- the sync and parity coverage.

A new synced table also changes the hard-coded counts in `supabase-readmodel/tests/rls_behaviour.sql` and `purge.sql`.

**Guards that must stay green and must never be weakened:**
- `lib/readModelWriteHooks.test.ts`;
- `netlify/functions/readmodelServerPush.test.ts`;
- `lib/readModelLocal/providerSwitch.test.ts`;
- `lib/readModelLocal/listenersOff.test.ts`;
- `shared/utils/readModel/mapping.test.ts`;
- `scripts/readmodelCrossUserIndexes.test.ts`.

Full rules: `docs/READ_MODEL_RULES.md`. Operations: `docs/READMODEL_RUNBOOK.md`.

### 1.2 No calculations in the app (SPENDLY-735, owner decision 2026-11-09)
- The Expense app **only saves the user's own actions and shows stored results**. Bills, subscriptions/EMIs, EPF, net-worth and portfolio snapshots, category upgrades, recurring detection, fee intelligence and ledger health all run on the **server**.
- Each job is `scripts/<name>-daily.ts`. It writes only through `scripts/lib/dailyJobCore.ts` and is gated by its own `*_DAILY_ENABLED` variable.
- **Server-side checks:**
  - Supabase finds the work, and Firestore confirms before writing (R4.3a).
  - After a save, a Supabase trigger queues the user, and `pg_net` dispatches the bill job (`server_run_queue`, SPENDLY-737).
- **Never** add a calculation back into the app, a second job framework, or a second writer.
- The app must not recompute authoritative totals in UI components. It shows the stored summaries.

### 1.3 Push notifications
Read `docs/PUSH_DEVELOPER_GUIDE.md` before adding one. Operations are in `docs/PUSH_RUNBOOK.md`.

### 1.4 Spark plan limits
- **No Cloud Functions.** `functions/` has never been deployed. Never propose Cloud Functions or Firestore triggers.
- **No Firestore TTL policies.** Index deploys fail with 403 "billing disabled"; expire docs from a job instead.
- **50K Firestore reads/day**, dev and prod combined. Budget the reads of every scheduled job, and avoid unconditional listeners (SPENDLY-406: mount a listener only where its data is rendered).
- Large ledgers are normal: the expenses listener is a **permanent 300-row page** ordered by `createdAt`. Never assume it holds full history. Use month or range queries (SPENDLY-748, 732).

---

## 2. Production safety
- **One Firebase project for dev and prod.** Never run a migration, backfill or data-changing script without:
  1. running its dry run;
  2. showing the owner the report;
  3. getting an explicit go-ahead for that specific run.
- `firebase deploy` of rules or indexes is a production change.
- **Index deploys:** `firebase deploy --only firestore:indexes` deletes live indexes that aren't in the file. Diff live against `firestore.indexes.json` first. A red nightly "Deploy Firestore rules" run is a drift signal: that run only diffs, and `workflow_dispatch` deploys.
- **Supabase migrations** are applied by hand (`npx supabase db push` in `supabase-readmodel/`, with a dry run first). `npx supabase migration list --linked` shows what's applied.
- **Device QA** uses the **Spendly Test** app on the Firebase emulator (`docs/LOCAL_TEST_MODE.md`), never the real app against production. Demo login: `demo@spendly.test` / `spendly-demo`. `npm run emulators:seed -- --months=12` seeds a ledger over 300 rows.
- Before changing phone display settings for QA, record the exact `wm size`, `wm density`, nav mode and theme, and restore them afterwards. Never use `reset`.
- Never commit secrets, service-account files or `.env` values.

---

## 3. Owner's working preferences
- **Scope:** one Jira story at a time. Ask before merging a story into its epic branch, and ask again before starting the next one (`docs/AGENT_WORKFLOW.md` §3).
- **Merges:** merge stories into the epic branch **locally** (`git merge --no-ff`) and run the PR checks locally. Open a GitHub PR only for **epic → main**, unless asked otherwise.
- **Jira:** project `SPENDLY` (use `KAN` only for Ganesh Seva), site `kesavach.atlassian.net`. Use In Progress when work starts. Move to Done **only when the change reaches `main`**, with a comment naming the merge commit, the doc, and anything left over (and which ticket carries it). Transition ids: 21 = In Progress, 31 = Done.
- **Docs:** every story gets `docs/SPENDLY-<n>-<slug>.md`. Every audit finding goes in `docs/` with a full explanation and a P0–P3 rank, not just in chat.
- **UI stories:** stop after the build. The owner reviews on local Expo web with demo data; don't take screenshots or start the next story.
- **Web deploy (Netlify):** don't trigger or suggest one unprompted (credits). Do it only when the owner asks.
- **Releases and deploys:** after triggering an app release or web deploy, report the run ids and stop; don't watch the runs. After pushing a branch, do confirm the **PR Checks** workflow passed.
- **Rules tests:** `npx vitest run` does not run `firestore/*.rules.test.ts`. Use `npm run test:rules` (needs port 8080 free).
- **Roadmap:** `.claude/spendly_epic_execution_roadmap.md` is context for placing a task, never a work order.
- **Dependencies:** if one is missing, name it and its minimum contract. Never build a parallel or duplicate version (no second ledger, calendar or notification system).

---

## 4. Known traps (already hit once)
- **Shared checkout:** another agent session may switch branches in `C:\dev\expense`. Use a worktree (`C:\dev\worktrees\spendly-<n>`) for multi-step work, and run `git branch --show-current` before every commit.
- **Worktree `node_modules` junction:** worktrees link `node_modules` to `C:\dev\expense\node_modules`. **Remove the link first** (`cmd /c rmdir <wt>\node_modules`), then run `git worktree remove`. Deleting the folder with the link in place wiped the shared install once. Running `npm install` inside a worktree replaces the link with a real folder.
- **Expo in a worktree:** start review Expo with `--clear`; the stale shared Metro cache shows "Welcome to Expo". Never use `CI=1`, which disables reloads. Full setup is in README → "Review on web against the emulator".
- **Android prebuild:** `npx expo prebuild` regenerates `android/` and wipes the release signing. Back up and restore `android/app/build.gradle` and `android/gradle.properties`. After a Spendly Test build, `android/` is the test variant.
- **NativeWind Pressable:** function-style `Pressable` styles are dropped under NativeWind. `lib/pressableStyleFix.ts` shims this; re-check on a device after any NativeWind or css-interop upgrade.
- **Errors:** user-facing errors and logging go through `lib/errors.ts` (`friendlyErrorMessage`, `logError`, `logWarning`). Firestore listeners use `snapshotErrorHandler` and `useLoadFailure`. Never show `error.message` raw.
- **Lint:** ESLint isn't configured in this repo. Validation is `npm test`, `npm run typecheck:shared`, `npx tsc -p tsconfig.json --noEmit` (slow) and `npm run test:rules`.
- **Script typecheck:** `scripts/tsconfig.json` typechecks no scripts (it inherits the root exclude). Use an include-based config to check `scripts/`.
- **SQL tests:** the Supabase SQL tests need Postgres in CI. Docker isn't available locally, so say when they could only run in CI.
- **Ganesh Seva:**
  - Languages are admin-assigned per member (`pandals/{p}/members/{uid}.language`), with a shrink-only i18n ratchet in `lib/ganeshI18nGuard.test.ts`.
  - Never import Ganesh i18n or fonts from shared layouts.
  - Gate admin UI on `isAdmin`.

---

## 5. Current state (snapshot 2026-11-09; verify in git and Jira)
- **On main and released or deployed:** the hybrid read model (SPENDLY-494), Supabase-first reads (586: clientWrites, localCopy and realtime are ON), push notifications (222), group funds (678), the Cloudflare web backup (621), and the desktop dashboard (718).
- **SPENDLY-735 (server calculations):**
  - On main (`618cebdb`). Firestore rules were deployed and Supabase migrations `20261112`/`13`/`14` were confirmed applied on 2026-11-09.
  - **Verify before relying on it:** the Vault `spendly_github_dispatch_token` plus `pg_net`, each job's dry run, the `*_DAILY_ENABLED` / `RECURRING_WEEKLY_ENABLED` variables, and the Worker redeploy (go-live order: `docs/SPENDLY-735-server-calculations-audit.md`, `docs/LEGACY_CRONS_RETIREMENT_RUNBOOK.md`).
- **SPENDLY-682 legacy crons:** moved in-repo and cut over on 2026-11-09.
- **Latest builds:** SPENDLY-748 (Journal month on demand) is on main (`424e185a`). Expense release run 42658879131 and Netlify deploy run 42658871155 were triggered on 2026-11-09. Device QA is pending.
- **Open work:**
  - **SPENDLY-749:** fixed Journal custom range incomplete period; on branch `fix/SPENDLY-749-journal-custom-range`.
  - **SPENDLY-288 Tax & ITR epic:** in worktree `spendly-288`, PR to main open. Its migration is now `20261115000000_readmodel_tax.sql` (was `20261110`): it runs after `20261112`–`14` and restates the table lists including `recurring_suggestions` and `server_results` plus the five tax tables.
  - **SPENDLY-625 price alerts:** planned, not started.
  - **SPENDLY-633 native Firestore cache:** done; Nutrition and Ganesh releases pending.
- **Push rollout:** testers are enabled. "Everyone" (C4b) waits on tester QA. Local reminders stand down in push mode (SPENDLY-746).

---

## 6. Keeping this file current
Any agent that changes architecture, adds a standing rule, or finishes a production rollout step should update the relevant section here in the same change. Don't paste per-story history here; that belongs in `docs/SPENDLY-<n>-*.md` and Jira.
