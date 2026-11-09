# Spendly push notifications: runbook

**Built by:** SPENDLY-222 (Spendly only).
**Adding a push to a feature:** see [PUSH_DEVELOPER_GUIDE.md](PUSH_DEVELOPER_GUIDE.md), which covers what's sent today, how it works, and the steps.
**Going live:** the first-time setup and switch-on steps are in [SPENDLY-222-go-live-checklist.md](SPENDLY-222-go-live-checklist.md). This page covers running it afterwards.
**Firebase project:** `expenseapp-27f94`. It is shared by dev and prod, it is on the Spark plan (no Cloud Functions), and reads are capped at 50K/day for everything together.

## How it works (one minute)

| Part | Where |
|---|---|
| Phones register their Expo push token | `users/{uid}/devices/{installId}` (224), also copied to Supabase |
| One job sends everything | GitHub Actions **Push reminders** (`push-reminders.yml`, every 15 min), `scripts/push-reminders.ts` |
| Reminders (each run) | Bills (231), calendar (694), dues (695), goals (696). Each item is **re-read before sending**, so a paid, done or settled item gets no push. |
| Events (hourly) | SIP and EPF (229), splits and vaults (697). Each also writes an inbox row (`users/{uid}/notifications`). |
| Sender | `shared/utils/push/pushSender.ts`, via the Expo Push Service. Once per key (`pushSendLogs/{key}`, kept 30 days; the job's hourly pass deletes expired logs, up to 200 a run, because Spark has no TTL policies: SPENDLY-713), never to opted-out users. A token shared by several accounts goes only to the latest owner. |
| Phones stop their own reminders | Only while `system_settings/global.pushRemindersLive` is on, or the user is in `pushRemindersLiveFor` (693) |

## Switches (no deploy needed)

| Switch | Where | Effect |
|---|---|---|
| **Kill switch** | `pushConfig/global.sendsDisabled = true` | Nothing is sent. The idempotency keys aren't used up, so notices go out later if still relevant. |
| **Phones' own reminders** | `system_settings/global.pushRemindersLive` | `true`: registered phones rely on push. `false`: every phone schedules its own reminders again (at its next app open). |
| **Staged rollout: phones** | `system_settings/global.pushRemindersLiveFor: [uid, …]` | Only these users' phones switch to push while `pushRemindersLive` is off |
| **Staged rollout: server** | `pushConfig/global.allowUids: [uid, …]` | Only these users are sent to. Empty or absent means everyone. Others' notices aren't used up. |
| **Schedule** | Repository variable `PUSH_REMINDERS_ENABLED` | `true`: the job runs every 15 min (started by the Cloudflare Worker, with GitHub's schedule as a fallback). Anything else stops both; manual runs still work. |
| **Read budget** | Variables `PUSH_MAX_READS_PER_RUN` (default 400), `PUSH_MAX_READS_PER_DAY` (default 6000) | The job stops early once spent (`stoppedForBudget` in the run summary); the next run carries on |

### Emergency stop
1. Set `pushConfig/global.sendsDisabled = true`. It takes effect immediately.
2. Set `system_settings/global.pushRemindersLive = false`, and clear `pushRemindersLiveFor`. Phones go back to their own reminders. **Don't skip this**, or registered phones get no reminders at all.
3. Optionally set `PUSH_REMINDERS_ENABLED = false`.

**To resume:** reverse the steps. Set `pushRemindersLive` back only after a manual run of the job succeeds.

## Reliable trigger (SPENDLY-716)

GitHub starts scheduled runs in this repository hours late, or drops them; in one test, the 15-minute schedule ran once in 11 hours. So a Cloudflare Worker, `spendly-push-trigger` (`cloudflare/push-trigger/`), calls GitHub's run-workflow API every 15 minutes.
- **What it sends:** `dry_run: false, trigger: cron`.
- **The on/off switch still applies:** those runs obey `PUSH_REMINDERS_ENABLED` like the schedule.
- **Fallback:** the GitHub schedule stays. A double run is harmless, because each notice is claimed once.
- **Daily jobs (SPENDLY-729):** the same Worker also has a `0 3 * * *` cron that dispatches `category-daily.yml` (SPENDLY-742), `subscription-daily.yml` (SPENDLY-739), `sip-daily.yml`, `epf-daily.yml` (SPENDLY-740), `bill-daily.yml` and `snapshot-daily.yml` (SPENDLY-741), each gated by its own variable. See [LEGACY_CRONS_RETIREMENT_RUNBOOK.md](LEGACY_CRONS_RETIREMENT_RUNBOOK.md). Redeploying the Worker deploys both crons.

**One-time setup:**
1. **Create the GitHub token.** Go to GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate.
   - Repository access: **Only select repositories** → this repository.
   - Permissions: **Actions: Read and write** only.
   - Expiry: up to 1 year. Note the date and rotate before it.
2. **Deploy the Worker** from the repository root, logged in to the Cloudflare account that holds the web backup:
   ```
   npx wrangler@4.158.0 login
   npx wrangler@4.158.0 deploy -c cloudflare/push-trigger/wrangler.toml
   npx wrangler@4.158.0 secret put GITHUB_DISPATCH_TOKEN -c cloudflare/push-trigger/wrangler.toml
   ```
   Paste the token when asked. It's stored only as a Worker secret.
3. **Check it.** Within 15 minutes, Actions → *Push reminders* shows a `workflow_dispatch` run every quarter hour. To see the Worker's own log, use Cloudflare → Workers → `spendly-push-trigger` → Logs, or `npx wrangler@4.158.0 tail -c cloudflare/push-trigger/wrangler.toml`.

**Pause or remove:**
- **Pause:** set `PUSH_REMINDERS_ENABLED` to `false`. The Worker's runs then start and skip at once, costing no reads.
- **Remove for good:** run `npx wrangler@4.158.0 delete -c cloudflare/push-trigger/wrangler.toml`.

**Rotate the token:**
- Generate a new one, then run `wrangler secret put GITHUB_DISPATCH_TOKEN` again.
- Then revoke the old token.
- An expired or revoked token shows as `GitHub answered 401` in the Worker log, and runs stop until it's replaced.

## Staged rollout (SPENDLY-233)

1. **Internal testers:**
   - set `pushConfig/global.allowUids` and `system_settings/global.pushRemindersLiveFor` to the testers' uids;
   - leave `pushRemindersLive` off and `sendsDisabled` false;
   - set `PUSH_REMINDERS_ENABLED = true`.
2. **Let it run a few days.** Work through the [device QA matrix](SPENDLY-233-qa-rollout.md#device-qa-matrix) and run **Push delivery report**.
3. **Everyone:**
   - set `pushRemindersLive = true`;
   - empty `allowUids`;
   - you can leave `pushRemindersLiveFor`, because it's ignored once everyone is live.

## Sending a test push safely

Dev and prod share Firebase, so **only ever send to your own token**.
1. Sign in on a **signed** Expense build. The local test build has no FCM.
2. Firestore → `users/{your uid}/devices/*` → copy `token`.
3. Send from https://expo.dev/notifications to that token only. Put `data` as `{"product":"expense","category":"bills","kind":"test","url":"/inbox","entityId":"test"}`, so a tap opens the inbox.

## Delivery report

Actions → **Push delivery report** → Run workflow (default: 7 days). The job summary shows:
- registered devices (and how many were active);
- accounts with a device;
- sends;
- messages accepted by Expo (target ≥ 98%);
- opted out / no device;
- pruned dead devices;
- per-category counts;
- error codes.

Script: `scripts/push-report.ts`. It is read-only and uses count() aggregations.

## Common errors (from the report, or `pushSendLogs.errors`)

| Code | Meaning | Action |
|---|---|---|
| `DeviceNotRegistered` | The app was uninstalled, or the token expired | None: the device doc is pruned automatically, from the ticket or the receipt |
| `InvalidCredentials` | Expo can't use the FCM key | Re-upload the FCM v1 key (below). Sends fail until then. |
| `MessageTooBig` | Payload over 4 KB | A bug in a source's copy: report it. Text is clipped to 80/240 characters, so this shouldn't happen. |
| `MessageRateExceeded` | Too many pushes to one device too fast | Retried with backoff. If it keeps happening, check for a source sending in a loop. |
| `SendFailed` | Expo unreachable after 3 tries (HTTP 429/5xx or network) | Usually transient. Check https://status.expo.dev. Reminders stay pending until the end of their day. |
| `stoppedForBudget` (run summary) | The daily or per-run Firestore read allowance was spent | Raise `PUSH_MAX_READS_PER_DAY` only if the Firebase usage page shows headroom under 50K/day |

## Rotating the FCM key

1. Google Cloud → IAM → Service accounts → `expo-push-fcm` → Keys → **Add key** (JSON).
2. Upload it to the Expo project for `com.example.expensetracker` (see [PUSH_CREDENTIALS.md](PUSH_CREDENTIALS.md)). It replaces the old key.
3. Send a test push to your own token.
4. **Delete the old key** in Google Cloud, then delete the local JSON file.

If you use an Expo access token (`EXPO_ACCESS_TOKEN` secret), rotate it in the Expo account, then update the Actions secret.

## Where to look

| Question | Look at |
|---|---|
| Did a run happen, and what did it do? | Actions → Push reminders → a run's log (JSON summary: reminders, events, receipts, reads) |
| Was a specific reminder sent? | `pushSendLogs/{uid}:{slotId}` (e.g. `…:ccbill:{billId}:due@2026-11-06`) |
| Is this phone registered? | `users/{uid}/devices/*` (`lastSeenAt` updates at most daily) |
| Does this phone rely on push? | Is `pushRemindersLive` on (or the user in `pushRemindersLiveFor`)? Does the device doc exist? Is permission allowed (Settings → Notifications card)? |
