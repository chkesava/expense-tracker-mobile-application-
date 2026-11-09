# Retiring the legacy SIP and bill crons (SPENDLY-682 / 729)

The old site `kesavaexpensetracker.netlify.app` (repo `chkesava/expense-tracker`) runs two daily crons at 03:00 UTC, `sip-execute` and `credit-card-bills`. This repo now has replacements: `sip-daily.yml` (SPENDLY-726) and `bill-daily.yml` (SPENDLY-727). This runbook switches over without a gap and without a double run.

**Order matters.** The app runs SIPs **only** from the button, so the legacy SIP cron is the only daily executor until `sip-daily` is live. Never switch it off first.

## What triggers what
| Job | Trigger | Gate |
|---|---|---|
| `sip-daily.yml` | Cloudflare Worker `spendly-push-trigger`, cron `0 3 * * *` (08:30 IST), sent as `trigger: cron` | `SIP_DAILY_ENABLED == "true"` |
| `bill-daily.yml` | same tick | `BILL_DAILY_ENABLED == "true"` |
| `push-reminders.yml` | same Worker, `*/15 * * * *` (unchanged) | `PUSH_REMINDERS_ENABLED` |

- **Manual dispatch** (Actions → Run workflow) always runs, **dry run by default**. Use it for previews.
- **No schedule of their own:** neither daily workflow has a `schedule:`, so the Worker is the only automatic trigger. A contract test pins this.

## Cut-over (each step needs the owner)
1. **Merge** the SPENDLY-682 epic to `main`. Both jobs stay disabled: the variables are unset, and the Worker isn't redeployed yet.
2. **Production dry run of each job.** Actions → *SIP daily* → Run workflow (`dry_run: true`, `trigger: manual`); the same for *Bill daily*. Check the step summary:
   - **SIP:** the plans due today in IST and what each would do (execute / skip / fail). No `virtualPortfolio` writes ever appear.
   - **Bills:** cards that closed today or yesterday, and the creates and updates planned.
   - **Both:** `failures: []`, and `stoppedForBudget: false`.
3. **Pick the switch-over morning.** Do steps 4–6 between 03:00 UTC (the legacy run) and the next day's 03:00 UTC, so that day has exactly one run of each.
4. **Turn off the legacy crons.** In `chkesava/expense-tracker`, edit `netlify.toml` and delete the `schedule = "0 3 * * *"` lines of `[functions."sip-execute"]` and `[functions."credit-card-bills"]`, then push.
   - The site keeps serving prices to pre-2026-10-12 APKs (SPENDLY-522). **Only the schedules go.**
   - Check: Netlify → the old site → Functions → each function shows no schedule.
5. **Enable the new jobs:** GitHub → Settings → Secrets and variables → Actions → Variables. Set `SIP_DAILY_ENABLED` = `true` and `BILL_DAILY_ENABLED` = `true`.
6. **Redeploy the Worker** with the new daily cron. The token secret is already set (PUSH_RUNBOOK, "Reliable trigger"):
   ```
   npx wrangler@4.158.0 deploy -c cloudflare/push-trigger/wrangler.toml
   ```
   Cloudflare → Workers → `spendly-push-trigger` → Triggers should list `*/15 * * * *` and `0 3 * * *`.
7. **Verify the first morning**, after 03:00 UTC:
   - Actions → *SIP daily* and *Bill daily* each show one `workflow_dispatch` run, green.
   - **SIP summary:** `executed` matches the plans due; `conflicts` is 0 or explained; `readModelPushed` > 0 when anything was written.
   - **Bills summary:** cards closing, `billsCreated` / `billsUpdated`; no duplicates.
   - **Read-only cross-check:**
     - `npx tsx scripts/report-duplicate-bills.ts` shows no new legacy random-id bills from that day;
     - `npx tsx scripts/report-sip-drift.ts` shows the new rows with app ids (`{sipId}_{date}`) and no double runs.
   - **The app:** the SIP dashboard shows today's execution; Card bills shows the new statement, already settled by any cashback.

## Pause or roll back
- **Pause one job:** set its variable to `false`. Worker runs then start and skip at once, with no reads.
- **Roll back to the legacy crons:**
  1. Set both variables to `false`.
  2. Restore the two `schedule` lines in the old repo.
  3. The next 03:00 UTC is the legacy run again.
- **Idempotent:** the new jobs' writes use the app's ids. A day run by both by mistake creates no duplicate SIP rows; the transaction-row create refuses. Bills are compare-and-set.

## Costs
- **SIP:** about 4 reads per due plan. Budget `SIP_MAX_READS_PER_RUN`, default 3000.
- **Bills:**
  - one collection-group read of all accounts;
  - plus each closing card's expenses, payments and bills.
  - Budget `BILL_MAX_READS_PER_RUN`, default 5000.
- Both fit Spark's 50K reads a day alongside the read-model sync (16K) and push reminders (6K).

## Data left by the legacy crons
`scripts/report-sip-drift.ts` and `scripts/report-duplicate-bills.ts` (SPENDLY-728) show:
- `virtualPortfolio` vs `virtualPositions` drift;
- wrong plan totals;
- double executions;
- legacy duplicate bills.

**Any repair is a separate ticket:** a dry run, a variance report, the owner's approval.
