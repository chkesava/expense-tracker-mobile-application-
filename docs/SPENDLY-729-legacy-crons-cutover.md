# SPENDLY-729 — 682-E: daily trigger and cut-over runbook

Sub-task of SPENDLY-682 ([plan](SPENDLY-682-plan.md), [tracker](SPENDLY-682-legacy-crons.md)). Branch `feature/SPENDLY-729-legacy-crons-cutover`.

## Code
| Change | Files |
|---|---|
| The `spendly-push-trigger` Worker gets a second cron, `0 3 * * *` (08:30 IST, the legacy crons' slot). It dispatches `sip-daily.yml` and `bill-daily.yml` as `dry_run: false, trigger: cron`, so each still needs `SIP_DAILY_ENABLED` / `BILL_DAILY_ENABLED`. The 15-minute push tick is unchanged. | `cloudflare/push-trigger/wrangler.toml`, `trigger.ts` (`workflowsForCron`, `dispatchForCron`, `dispatchWorkflow`), `worker.ts` (routes by `controller.cron`) |
| Tests: routing per cron, both daily dispatches cron-marked, one failure doesn't stop the other, push tick unchanged. A line-ending-safe contract checks that both daily workflows accept the inputs, obey their variable and have no `schedule:` of their own. The cron contract now pins both crons. | `cloudflare/push-trigger/trigger.test.ts` |
| Cut-over runbook (steps, verification, pause / rollback, costs) and a pointer from the push runbook. | `docs/LEGACY_CRONS_RETIREMENT_RUNBOOK.md`, `docs/PUSH_RUNBOOK.md` |

## Cut-over (the owner's steps, after the epic reaches main)
The full detail is in the [runbook](LEGACY_CRONS_RETIREMENT_RUNBOOK.md):
1. Merge the epic.
2. Run a production dry run of each job and review it.
3. Remove the two `schedule` lines in `chkesava/expense-tracker`'s `netlify.toml`.
4. Set `SIP_DAILY_ENABLED` and `BILL_DAILY_ENABLED` to `true`.
5. Redeploy the Worker.
6. Verify the first morning.

Until step 3 the legacy SIP cron must keep running: the app has no automatic SIP run.

## Verification
- `npx vitest run cloudflare/push-trigger/trigger.test.ts`: 13/14 pass. The one failure is the pre-existing `PUSH_REMINDERS_ENABLED` contract test on a Windows CRLF checkout (SPENDLY-720); CI on Linux passes it. The new daily contract tests normalise line endings.
- `npx tsc -p tsconfig.json --noEmit` (includes the Worker): clean.
- Not deployed. Deploying the Worker and setting the variables are cut-over steps 4–5.
