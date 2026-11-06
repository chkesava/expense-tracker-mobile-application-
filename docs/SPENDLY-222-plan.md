# SPENDLY-222: Push notifications plan

**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). Push Notifications: reliable remote push and reminders across Ganesh Seva, Spendly and Nutrition.
**Epic branch:** `feature/SPENDLY-222-push-notifications`, cut from `origin/main` at 73db1556 (2026-11-06).
**Worktree:** `C:\dev\worktrees\spendly-222` (`node_modules` is a junction to the main checkout, so start Expo with `--clear`).
**Tracker:** [SPENDLY-222-push-notifications.md](SPENDLY-222-push-notifications.md).

## 1. Where things stand (checked 2026-11-06)

| Area | Repo today |
|---|---|
| Remote push | **None.** No `getExpoPushTokenAsync`/`getDevicePushTokenAsync`, no token storage, no sender anywhere (`functions/`, `netlify/functions/`, `supabase/`). |
| Local notifications | Expense only: bill reminders (`services/creditCardBills/billReminderScheduler.ts`), calendar (`services/calendar/calendarNotificationScheduler.ts`, SPENDLY-184), goals (`services/goals/goalReminderScheduler.ts`), recurring detector, SMS (`providers/SmsReceiverProvider.tsx`). |
| Tap routing | `hooks/useNotificationTapRouting.ts` (SPENDLY-184), mounted in `app/_layout.tsx`, with an allow-list in `shared/utils/calendarNotifications.ts` (`isRoutableNotification`). **230 must extend this, not add a second router.** |
| In-app inbox rows | `users/{uid}/notifications`, written by `services/sip/executeSips.ts`. Not in the read-model `mapping.ts`. |
| Server runtimes | Firebase Cloud Functions codebase `ganesh` (`functions/src/index.ts`, Firestore triggers already deployed). Netlify functions (EPF cron, read-model push). Netlify credits are low, so new **scheduled** work should prefer Cloud Functions or GitHub Actions. |
| iOS | `app.config.js` has no per-product `bundleIdentifier`. There is no APNs key. |
| Related in-flight work | SPENDLY-625 price alerts (planned, worktree `spendly-625`) defines a delivery interface and says "real push plugs in through SPENDLY-222". The sender must plug into that interface, not run beside it. |
| Audit doc | `docs/PUSH_NOTIFICATIONS_AUDIT_2026-09-27.md` is cited by the epic but **isn't in the repo** (it was never committed). Story 233 must mark findings PN-1…PN-10 resolved there, so it needs recreating or re-pointing (see decision D6). |

## 2. Stories and order

The Jira Blocks links give the critical path: 223 → 224 → 227 → {228, 229, 231} → 233. Story 226 blocks 227, and 230 blocks 228. Stories 225 and 232 have no blockers.

| # | Story | Depends on | Kind | Main files / areas |
|---|---|---|---|---|
| 1 | **223** Credentials and transport | — | Mostly **user ops** (EAS FCM v1 upload, APNs key) + config | `app.config.js` (iOS bundle ids per product), `docs/PUSH_CREDENTIALS.md` |
| 2 | **224** Device registration | 223 (config only; code can be built and emulator-tested first) | App + rules | new `lib/push/registerDevice.ts`, `shared/utils/push/` (pure device doc shape), auth sign-out hook, `netlify/functions/delete-account.ts`, `firestore.rules` + rules tests |
| 3 | **225** Contextual permission + recovery | — | App UX, all 3 products | new `lib/push/permission.ts`; remove `requestPermissionsAsync` from the bill, SMS, calendar and goal schedulers (read-only there) |
| 4 | **226** Preferences per product | — (blocks 227) | App + rules + read model | `users/{uid}/notificationPrefs/{product}` (+ per-pandal Ganesh doc), settings screens, Android channels |
| 5 | **227** Shared server sender | 224, 226 | Server | pure core in `shared/utils/push/` (chunking, payload contract, idempotency, receipt handling) + thin adapters for Cloud Functions and Netlify; `pushSendLogs` with TTL; kill switch |
| 6 | **230** Router + inbox | — (blocks 228) | App | extend `useNotificationTapRouting` + allow-list with `data.product`/`data.url`; Ganesh inbox screen behind the Home bell; Spendly inbox includes push rows |
| 7 | **228** Ganesh pandal events | 227, 230 | Cloud Functions + Ganesh UI | `functions/src` triggers, recipient resolver (active members, by role, never cross-pandal), Ganesh i18n copy, announcements from Admin |
| 8 | **229** Spendly server events | 227 | Server | `services/sip/executeSips.ts`, `netlify/functions/epf-cron.ts`, shared vaults/splits |
| 9 | **231** Server bill reminders | 227 | Server + app | scheduled function, dedupe with local reminders (shared collapse id), quiet hours server-side |
| 10 | **232** SMS alert when app closed | — | Native Android | `modules/sms-reader` manifest receiver + headless task, Expense/combined builds only |
| 11 | **233** QA, monitoring, rollout | all | QA + docs | device matrix on **signed** builds, delivery report, runbook, staged rollout |

**Suggested working order:** 223 (config part) → 224 → 226 → 227 → 230 → 228 → 229 → 231 → 225 → 232 → 233. 225 and 232 can move earlier because nothing blocks them. As always, it's **one story at a time, with approval before each merge and before the next story** (AGENT_WORKFLOW §3).

## 3. Invariants every story must keep

1. **No wrong recipient.** A push never reaches another user, another pandal or another product. Recipient resolution is a pure, tested function, with emulator tests for the cross-pandal guarantee.
2. **No secrets in the repo.** FCM/APNs credentials live in EAS and the server environment only. Tokens are never logged.
3. **Lock-screen privacy.** The payload is `data = { product, kind, url, entityId }`. No amounts unless the product already shows them and the user opts in.
4. **Idempotent sends.** Every send carries an `idempotencyKey`, so trigger and cron retries never duplicate.
5. **One notification system.** Extend `useNotificationTapRouting`, the `users/{uid}/notifications` rows and the 625 delivery interface. No parallel router or inbox.
6. **Multi-app safety.** Product checks around every product-specific path. Expense and Nutrition are verified unaffected by Ganesh work, and the local-test build keeps working without FCM.
7. **Shared Firebase.** Rules and index deploys, and any backfill, are production changes: dry run, diff, and explicit approval. Test sends go only to allow-listed test tokens.
8. **Dual write (CLAUDE.md).** Every new user-data collection gets the read-model treatment, or an explicit, user-approved exemption recorded in the guard allowlists (decision D2).

## 4. Decisions needed from the user

| # | Decision | Recommendation |
|---|---|---|
| D1 | Transport | **Expo Push Service** (uses the existing EAS projectId, one API for Android and iOS, free). Fallback is direct FCM v1 via `firebase-admin` messaging. |
| D2 | Read model for push collections | `devices` (tokens) and `pushSendLogs` are **server-consumed, never displayed** → ask for an exemption from Supabase sync (tokens are sensitive, and copying them widens exposure), recorded in the guard allowlists. `notificationPrefs` and the inbox `notifications` rows **are shown in the app** → dual-write them (TableSpec, migration + RLS, `rm_client_apply` allowlist, purge, indexes). |
| D3 | Where the sender runs | Pure core in `shared/`. Ganesh triggers and scheduled bill reminders on **Cloud Functions** (already deployed, avoids Netlify credits). SIP/EPF on their existing runtimes (EPF stays in the Netlify cron). |
| D4 | iOS in scope now? | Needs an Apple developer account + APNs key. If there isn't one yet, ship Android first and keep the iOS acceptance criteria of 223 open. |
| D5 | Ganesh Jira project | The stories are already in `SPENDLY`, so keep them there (KAN is for new Ganesh-only work). |
| D6 | Missing audit doc | Recreate `docs/PUSH_NOTIFICATIONS_AUDIT_2026-09-27.md` from the epic and story descriptions in the 233 docs, or drop that criterion. |

## 5. Deploys this epic will need (none without approval)

- `firestore.rules` (devices, prefs, pushSendLogs) + rules tests, deployed before any build that writes them.
- Firestore TTL policy on `pushSendLogs`, plus any new indexes, diffed against live first.
- Cloud Functions deploy (`ganesh` codebase, plus any new push codebase).
- Supabase migration(s) for prefs/inbox per D2.
- New signed Android builds per product (registration and the SMS receiver are native-affecting). Remember the prebuild signing backup.
