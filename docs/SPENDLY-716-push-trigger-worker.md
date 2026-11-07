# SPENDLY-716: Reliable 15-minute trigger for push reminders

**Ticket:** [SPENDLY-716](https://kesavach.atlassian.net/browse/SPENDLY-716) (Story). **Epic:** [SPENDLY-222](SPENDLY-222-push-notifications.md).
**Branch:** `feature/SPENDLY-716-push-trigger-worker`, from `main`, since the epic is already on `main`.

## Why

GitHub Actions schedules in this repository run late or not at all. Evidence from the week to 2026-11-07:

| Workflow | Scheduled | Actually |
|---|---|---|
| Push reminders | every 15 min | 1 run in about 11 hours |
| Read-model sync health | hourly at :45 | about 4 runs a day |
| Deploy Firestore rules (nightly check) | 03:17 UTC | about 10:46 UTC |
| Read-model sync | 20:30 UTC | about 00:30 UTC |

Reminders expire at the end of the user's day (692), so a missed run means a missed reminder. Manual dispatches start within seconds.

## Decision (owner, 2026-11-07)

A **Cloudflare Worker cron** calls GitHub's run-workflow API every 15 minutes. The job itself stays on GitHub Actions (D3).

The alternatives were not chosen:
- **cron-job.org:** outside the repository, with no tests.
- **Supabase pg_cron:** couples push to the read model.
- **Staying on the GitHub schedule:** too late to be useful.

## Built

| File | What |
|---|---|
| `cloudflare/push-trigger/trigger.ts` | Builds the dispatch request: `POST /repos/…/actions/workflows/push-reminders.yml/dispatches`, `ref: main`, `inputs: { dry_run: "false", trigger: "cron" }`. Logs the outcome, never the token. Doesn't retry: the next tick tries again. |
| `cloudflare/push-trigger/worker.ts` | `scheduled()` entry (default export only) |
| `cloudflare/push-trigger/wrangler.toml` | `spendly-push-trigger`. Cron `*/15 * * * *` (UTC). `workers_dev = false`, no routes, so nothing can call it. |
| `.github/workflows/push-reminders.yml` | New `trigger` input (`manual` by default, or `cron`). The run condition is `PUSH_REMINDERS_ENABLED == 'true' \|\| (dispatch && trigger != 'cron')`, so **Worker runs obey the on/off variable** (the emergency stop). Manual runs work as before, and the GitHub schedule stays as a fallback. |
| `docs/PUSH_RUNBOOK.md` | "Reliable trigger": token, deploy, check, pause, rotate |
| `docs/SPENDLY-222-go-live-checklist.md` | New step C4a, and a D row |

**Double runs are safe.** If the Worker and a late GitHub schedule both fire, the workflow's concurrency group runs them one after the other. Each notice is claimed once (`pushSendLogs`), so a double run costs only its reads, about 6–10.

**Dual-write:** not applicable. The Worker stores no user data.

## Tests

`cloudflare/push-trigger/trigger.test.ts` (8 tests):
- **The request:** URL, method, inputs and authorization header.
- **Responses:**
  - a 204 succeeds silently;
  - with no token, nothing is dispatched;
  - an HTTP or network failure is logged once, without retrying and without the token.
- **Contract:**
  - the workflow accepts `dry_run` and `trigger: cron`;
  - its run condition still checks `PUSH_REMINDERS_ENABLED` for cron runs;
  - `wrangler.toml` fires every 15 minutes and exposes no URL.

`wrangler deploy --dry-run` bundles it: 2.13 KiB, no bindings.

## Owner action (go-live step C4a)

1. Create a fine-grained GitHub token: this repository only, **Actions: Read and write**.
2. Deploy, then set the secret, using the commands in [PUSH_RUNBOOK.md](PUSH_RUNBOOK.md#reliable-trigger-spendly-716).
3. Check that a *Push reminders* `workflow_dispatch` run appears every 15 minutes.
