# Read model: what to do after PR #234 is merged

Epic [SPENDLY-494](https://kesavach.atlassian.net/browse/SPENDLY-494). PR: [#234](https://github.com/chkesava/expense-tracker-mobile-application-/pull/234).

This is the exact, ordered list of steps that make the Supabase read model work in production. It's written to be followed without any other context. Background and troubleshooting are in `docs/READMODEL_RUNBOOK.md`.

**What changes when.** Every screen keeps reading Firestore until you switch it (step 10), and the sync does nothing until step 8. **One thing changes at the next web deploy (step 5): account deletion.** It now also erases the Supabase copy, and it *fails closed*. If the Netlify variables from step 4 are missing, deletion stops with "Account deletion is paused…" and the login is not deleted. So do step 4 before step 5. Each step below is safe to stop after.

| # | Step | Where | Time | Reversible? |
|---|---|---|---|---|
| 0 | Clear the GitGuardian false positive, merge #234 | GitGuardian, GitHub | 5 min | — |
| 1 | Apply the database migrations | Supabase SQL editor | 10 min | Yes (runbook "Turning it off") |
| 2 | Turn on Firebase sign-in for Supabase | Supabase dashboard | 2 min | Yes |
| 3 | GitHub secrets and variables | Terminal / GitHub | 5 min | Yes |
| 4 | Netlify environment variables | Netlify dashboard | 5 min | Yes |
| 5 | Deploy the web app and Netlify functions; release Android | GitHub Actions | 30 min | Yes |
| 6 | Live security check | Terminal | 2 min | Read-only |
| 7 | First copy: dry run, then the real run, then verify | GitHub Actions | 20 min | Yes (rebuild) |
| 8 | Switch the schedule on | Terminal / GitHub | 1 min | Yes |
| 9 | Wait for 14 clean days | — | 14 days | — |
| 10 | Switch screens one at a time (shadow → supabase) | Terminal | 7+ days each | Yes, instantly |
| 11 | Measure, sign off, close Jira | Firebase console, Jira | 1 h | — |

---

## 0. GitGuardian, then merge

GitGuardian flags **incident #38867483**, a "Generic Password" in `.github/workflows/readmodel-schema.yml`, commit `26c86ea`.

**It is not a real secret.** It was `POSTGRES_PASSWORD: postgres` / `PGPASSWORD: postgres`, the password of the throwaway Postgres container that CI starts for the SQL tests and destroys after the job. Nothing outside the CI job ever used it. The current file no longer has it (commit `44c32d4e` switched CI to password-less local auth). But GitGuardian scans every commit in the PR, so the check stays red until the incident is resolved:

1. Open https://dashboard.gitguardian.com → **Incidents** → **#38867483**.
2. **Resolve** (or **Ignore**) → reason **"Test credential"** / **"False positive"**. Add a note: "CI-only throwaway container password, removed in 44c32d4e".
3. Re-run the GitGuardian check on the PR, or push any commit. It turns green.

Then merge #234 into `main` (a merge commit, not squash, so the story history stays).

**After merging, in Jira:** move 502, 504–513, 519, 520 and 571 to **Done**, each with a comment linking the merge commit (AGENT_WORKFLOW: Done on merge to main). The epic SPENDLY-494 stays open until step 11.

## 1. Apply the database migrations (Supabase)

Project: **`spmsgncjbnbkxvsbpqlu`**. Open https://supabase.com/dashboard/project/spmsgncjbnbkxvsbpqlu/sql/new.

`20261017000000_readmodel_wave1.sql` was applied on 2026-10-17. Apply the rest **in this order**: for each one, open the file from `supabase-readmodel/supabase/migrations/` on `main`, paste the whole file, and click **Run**.

| Order | File | What it adds |
|---|---|---|
| 1 | `20261022000000_readmodel_read_policies.sql` | Owner-only read rules (RLS) and the identity check |
| 2 | `20261023000000_readmodel_sync.sql` | The sync's write functions |
| 3 | `20261024000000_readmodel_purge.sql` | Account-deletion purge |
| 4 | `20261025000000_readmodel_verify.sql` | Count check |
| 5 | `20261026000000_readmodel_views.sql` | Reporting views, parity checks, repair |
| 6 | `20261027000000_readmodel_phase3_reads.sql` | Lets signed-in users read the cash-flow view |
| 7 | `20261028000000_readmodel_push.sql` | Per-write push: rate limit and daily counters (SPENDLY-583) |

**Use one method, not both.** Pasting into the SQL editor doesn't record the migration in Supabase's migration history (`supabase_migrations.schema_migrations`), so a later `supabase db push` would try to apply it again. If you prefer the CLI:
- link it (`npx supabase link --project-ref spmsgncjbnbkxvsbpqlu --workdir supabase-readmodel`);
- run `npx supabase migration list --workdir supabase-readmodel` first;
- if `20261017000000` (or anything you already pasted) shows as not applied remotely, mark it applied with `npx supabase migration repair --status applied <version> --workdir supabase-readmodel`;
- then `npx supabase db push --workdir supabase-readmodel`.

**Check:** run this. It must return 11 rows, every one `SELECT` and `{authenticated}`:
```sql
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1;
```
This one must return **no rows** (nobody signed out can read anything). It checks effective privileges, so a grant to `PUBLIC` or through role membership is caught too:
```sql
select c.relname, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
  and has_table_privilege('anon', c.oid, 'SELECT');
```
And from a terminal, a request with only the publishable key (no sign-in) must be refused (HTTP 401 or 403, or an empty list `[]`, never rows):
```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://spmsgncjbnbkxvsbpqlu.supabase.co/rest/v1/v_cash_flow_by_month?select=*" \
  -H "apikey: <publishable key>"
curl -s "https://spmsgncjbnbkxvsbpqlu.supabase.co/rest/v1/expenses?select=doc_id&limit=1" -H "apikey: <publishable key>"
```

## 2. Turn on Firebase sign-in for Supabase

Supabase dashboard → **Authentication** → **Sign In / Providers** → **Third-Party Auth** → **Add provider** → **Firebase** → project id **`expenseapp-27f94`** → Save.

**Check:** that's the only third-party provider listed. If any other is there, remove it.

## 3. GitHub secrets and variables

Run these in the Claude Code prompt with a leading `!`, or in your own terminal. Each `gh secret set` asks you to paste the value, so it never appears in a file or a chat. Values come from Supabase → **Project Settings** → **API Keys**.

```bash
gh secret set READMODEL_SUPABASE_SERVICE_ROLE_KEY            # the SECRET key (sb_secret_… or the service_role JWT)
gh secret set EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY  # the PUBLISHABLE key (sb_publishable_…), safe for the app
```

Already set (check with `gh variable list` and `gh secret list`):

| Name | Kind | Value | Status |
|---|---|---|---|
| `READMODEL_SUPABASE_URL` | variable | `https://spmsgncjbnbkxvsbpqlu.supabase.co` | Set 2026-10-22 |
| `FIREBASE_SERVICE_ACCOUNT` | secret | the existing Firebase admin key | Exists; the sync reuses it |
| `READMODEL_FIREBASE_SERVICE_ACCOUNT` | secret | *optional*: a key with only **Cloud Datastore Viewer** | Not needed. If you add it later, the sync uses it automatically |
| `READMODEL_SYNC_ENABLED` | variable | **leave unset until step 8** | — |
| `READMODEL_MAX_READS_PER_DAY` | variable | optional, default `12000` | — |

**Never** put the secret key in the app, in `.env`, or anywhere starting with `EXPO_PUBLIC_`. The tests and the bundle scanner fail if you do.

## 4. Netlify environment variables (before the next web deploy)

Netlify → the Spendly site → **Site configuration** → **Environment variables** → **Add a variable**, scope **Functions**:

| Key | Value |
|---|---|
| `READMODEL_SUPABASE_URL` | `https://spmsgncjbnbkxvsbpqlu.supabase.co` |
| `READMODEL_SUPABASE_SERVICE_ROLE_KEY` | the Supabase **secret** key (same as step 3) |

`FIREBASE_SERVICE_ACCOUNT` is already set on the site (`delete-account` uses it). The new `readmodel-claims` function reuses it.

> ⚠️ **Do this before step 5.** Since the PR review, account deletion **fails closed**. If these two are missing, deletion stops at the `readmodel` step with "Account deletion is paused while we finish a setup step", and the person's login is not deleted. That is deliberate: no login is deleted while its data stays in Supabase.

## 5. Deploy

There are **no** Firestore rules, index, dependency or native-config changes in #234, so there's no `firebase deploy` and no new native build requirement. Two deploys carry the new code and settings:

1. **Web + Netlify functions:** GitHub → **Actions** → **web-deploy** → **Run workflow** on `main`. It's manual-only and also deploys `readmodel-claims` and the new `delete-account`. Or: `gh workflow run web-deploy.yml --ref main`.
2. **Android:** run your usual **release** workflow (`release.yml`). Builds made before this don't carry `EXPO_PUBLIC_READMODEL_*`, so for them every screen simply stays on Firestore. That's safe, just not using the read model.

Before releasing, follow `docs/AFTER_MERGE_CHECKLIST.md` for anything else pending from other merges (for example, the SPENDLY-568 rules deploy noted there).

**Optional, but recommended once:** check the built web bundle for leaked keys:
```bash
npx expo export --platform web --output-dir dist-web && npx tsx scripts/scan-bundle-secrets.ts dist-web
```
It must print `no server secrets found`.

## 6. Live security check (read-only)

```bash
READMODEL_SUPABASE_URL=https://spmsgncjbnbkxvsbpqlu.supabase.co \
READMODEL_SUPABASE_PUBLISHABLE_KEY=<publishable key> \
npx tsx scripts/readmodel-identity-check.ts
```
No token, a forged token and a malformed token must all show **PASS**: Supabase rejects them. Then sign in to the web app once, so `readmodel-claims` gives your account its role. The real-token case can be re-run to show you see only your own rows.

## 7. First copy (backfill): dry run → approve → real run → verify

The first copy is a full sync. It **only reads** Firestore: about one read per document, so ≈ 3,800 for today's data, inside the 6,000 per-run budget.

1. **Dry run.** Actions → **Read-model sync** → **Run workflow** → `mode = full`, `dry_run = true`. Or:
   ```bash
   gh workflow run readmodel-sync.yml --ref main -f mode=full -f dry_run=true
   ```
   Open the run's log: reads used, documents per collection, `unmapped` (should be 0), failures (must be 0).
2. **Approve.** Review those numbers. If anything looks wrong, stop here; nothing has been written.
3. **Real run:**
   ```bash
   gh workflow run readmodel-sync.yml --ref main -f mode=full -f dry_run=false
   ```
   The run's **Verify count parity** step runs right after. Its summary table must show every collection matching.
4. If the run ends `partial` (read budget), run step 3 again. It resumes; running twice is harmless.

## 8. Switch the schedule on

```bash
gh variable set READMODEL_SYNC_ENABLED --body true
```
From now on:
- **Read-model sync:** nightly at 02:00 IST (everything, plus verify and parity). About 4,300 Firestore reads a day. The 3-hourly schedule was removed on 2026-10-23 so the sync can't push peak days past Firebase's free 50K. Near-instant updates come with SPENDLY-583.
- **Read-model sync health:** hourly at :45.

GitHub emails you when a run fails. The health run's summary says why, and the runbook's first table says what to do.

**Check, the next day:** both workflows show green runs, and the health summary shows "Parity gate: 1 of 14".

## 9. Wait for 14 clean days

Nothing to do but watch. A clean day is a nightly full run with no field differences, a passing verify, and no failed run. Progress shows in the health summary, or:
```bash
gh workflow run readmodel-sync.yml --ref main -f mode=report
```
If a day isn't clean, the runbook's "How you find out something is wrong" table has the fix. The count restarts.

When it reaches 14 of 14, paste the `mode=report` output into `docs/` and comment on SPENDLY-510.

## 10. Switch screens one at a time

Five screens can each be switched, in any order. A sensible order is `journal`, `insights`, `cashback`, `cashFlow`, `audit`. For each:

```bash
# 1) Prove it: the screen still shows Firestore, and compares in the background.
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=shadow            # dry run: shows the change
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=shadow --apply

# 2) After 7 days with zero differences (no "readModel.shadow.journal" warnings): switch it.
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=supabase --apply

# Kill switch, any time, no release needed:
npx tsx scripts/readmodel-set-mode.ts --screen=journal --mode=firestore --apply
```
These scripts write `system_settings/global.readModel` in **production** Firestore. They need `GOOGLE_APPLICATION_CREDENTIALS` pointing at the Firebase admin key on your machine, and they print `Target: PRODUCTION` first. You can also edit the field in the Firebase console.

**Before switching any screen to `supabase`:** SPENDLY-583 (push each save to Supabase within seconds) must be **deployed**:
1. migration `20261028000000` applied;
2. a web deploy (ships the `readmodel-push` function);
3. an app release (ships the push hooks).

Check that it works by saving an expense, then looking at `select * from public.push_daily;` in the SQL editor, or at the hourly health summary's "Per-write pushes today" line. Without it, another device could see older history and analytics up to a day late. The device that made the change always shows it at once ("Updating…").

## 11. Measure, sign off, close

1. **Firestore reads:** in the Firebase console → Usage, export daily reads for the 7 days before the first switch and the 7 days after the last. Add the sync's own reads with `supabase-readmodel/reports/sync_metrics.sql` (paste it into the Supabase SQL editor; it's read-only). Record both in `docs/SPENDLY-519-performance-security-cost.md` §5.
2. **30 days after step 8:** run `sync_metrics.sql` again for sync duration p50/p95 and failure rate, and record them there too.
3. **Readiness review:** read `docs/SPENDLY-494-readiness-review.md` and comment your sign-off on SPENDLY-520.
4. Close SPENDLY-494.

---

## Files changed in #234 that need setup (reference)

| File | What changed | What it needs |
|---|---|---|
| `.github/workflows/readmodel-sync.yml` | **New.** The sync: nightly (since 2026-10-23), and manual (`mode` = incremental/full/verify/report, `dry_run`) | Secrets: `READMODEL_SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT` (or `READMODEL_FIREBASE_SERVICE_ACCOUNT`). Variables: `READMODEL_SUPABASE_URL`, `READMODEL_SYNC_ENABLED` (step 8). **Runs only from `main`** |
| `.github/workflows/readmodel-health.yml` | **New.** Hourly health check; fails (and emails) on problems | Same secret and variables as the sync |
| `.github/workflows/readmodel-schema.yml` | **New.** CI for `supabase-readmodel/**`: migrations, security, RLS, sync functions, purge, verify, views, golden, performance | Nothing: it uses a throwaway Postgres in the job |
| `.github/workflows/web-deploy.yml` | Writes `EXPO_PUBLIC_READMODEL_SUPABASE_URL` / `_PUBLISHABLE_KEY` into the web build's `.env` | Variable `READMODEL_SUPABASE_URL`, secret `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY` |
| `.github/workflows/release.yml` | Same two values for the Android build | Same |
| `netlify/functions/readmodel-claims.ts` | **New** Netlify function: gives each signed-in user the role Supabase needs | Existing `FIREBASE_SERVICE_ACCOUNT` on Netlify; deploys with web-deploy |
| `netlify/functions/delete-account.ts` | A new `readmodel` step erases the user from Supabase; fails closed if unconfigured | Netlify `READMODEL_SUPABASE_URL` + `READMODEL_SUPABASE_SERVICE_ROLE_KEY` (step 4) |
| `supabase-readmodel/supabase/migrations/*` | The read-model database | Step 1 |
| `CLAUDE.md`, `AGENTS.md`, `docs/READ_MODEL_RULES.md` | Rules every future feature and agent follows | Nothing |

## If something goes wrong

| Problem | Do this |
|---|---|
| A screen shows wrong or old data | `npx tsx scripts/readmodel-set-mode.ts --screen=<screen> --mode=firestore --apply`. Instant, no release |
| Stop all syncing | `gh variable set READMODEL_SYNC_ENABLED --body false` |
| Block every client read from Supabase | SQL editor: `revoke select on all tables in schema public from authenticated;` |
| The Supabase copy is broken | Rebuild it: runbook → "Replay and recovery" → "Rebuild from scratch". Firestore is never touched |
| Account deletion says "paused" | Step 4 wasn't done: add the two Netlify env vars and redeploy (step 5) |
| Sync or health workflows stopped running | GitHub disables schedules after 60 days without repo activity: Actions → the workflow → **Enable workflow** |
