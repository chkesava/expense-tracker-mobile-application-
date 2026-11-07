# SPENDLY-222: Push notifications go-live checklist

Everything that has to **run or be done outside the code** before Spendly push notifications work for real.
- **Updated:** with every story merged into the epic. Each step names the story that needs it.
- **Production steps:** Firebase project `expenseapp-27f94` is shared by dev and prod with no staging. Every deploy and switch-on below is a production change: do it only with approval, and after the dry run where one is listed.
- **Runtime:** the server side runs on **GitHub Actions** (decision D3). The project is on Spark, so there are no Cloud Functions.

**Status key:** ☐ not done · ☑ done (add the date and who)

---

## A. One-time setup (can be done now, before the epic merges)

| # | Step | For | How | Status |
|---|---|---|---|---|
| A1 | **FCM v1 key for the Expense app** | 223 | Create a service account `expo-push-fcm` with only *Firebase Cloud Messaging API Admin* in project `expenseapp-27f94`. Create a JSON key, upload it to the Expo project (`1a9206a6-…`) for `com.example.expensetracker`, then delete the local file. Full steps: [PUSH_CREDENTIALS.md](PUSH_CREDENTIALS.md). | ☐ |
| A2 | **A writable Firebase service account for the job** | 692 | The job writes `pushSendLogs`, `pushConfig/usage-*` and device deletes, so it needs Firestore read/write. Either confirm the existing `FIREBASE_SERVICE_ACCOUNT` secret has it, or add a separate `PUSH_FIREBASE_SERVICE_ACCOUNT` secret (role: *Cloud Datastore User*). Don't reuse a read-only read-model account. | ☐ |
| A3 | *(Optional)* **Expo access token** | 227 | If you turn on "enhanced push security" in the Expo project, add the token as the `EXPO_ACCESS_TOKEN` Actions secret. **If that security is on and the secret is missing, every send fails.** | ☐ |
| A4 | **Read-model settings for the job** | 692 | `READMODEL_SUPABASE_SERVICE_ROLE_KEY` (secret) and `READMODEL_SUPABASE_URL` (variable) already exist for the sync. Nothing to add. Without them, pruned device deletes reach Supabase at the nightly sync instead. | ☐ check |
| A5 | **Start with the kill switch ON** | 227 | In the Firestore console, create `pushConfig/global` with `{ sendsDisabled: true }`. Nothing can send until step C4. | ☐ |

## B. After the epic merges to `main` (production deploys, in this order)

| # | Step | For | How | Status |
|---|---|---|---|---|
| B1 | **Diff indexes against live** | 224, 227 | `firebase firestore:indexes --project expenseapp-27f94 > live-indexes.json`, then compare with `firestore.indexes.json`. The repo file must contain every live index, because a deploy **deletes** any index not in the file (FIREBASE_RULES_DEPLOY.md). New in this epic: field overrides `devices.createdAt`, `devices.updatedAt` and `devices.token` (collection group), and the TTL on `pushSendLogs.expireAt`. | ☐ |
| B2 | **Deploy indexes + TTL** | 224, 227 | Actions → *Firestore rules deploy* → `deploy_indexes` on, dry run first, then the real run. Or `firebase deploy --only firestore:indexes`. TTL policies can take a while to become active. | ☐ |
| B3 | **Deploy Firestore rules** | 224, 227 | `npm run test:rules`, then Actions → *Firestore rules deploy* (dry run, then real). It adds `users/{uid}/devices` (owner-only, validated) and denies clients `pushConfig` and `pushSendLogs`. **This must be live before the new app build ships**: the app writes `devices` on sign-in, and without the rule that write is denied. | ☐ |
| B4 | **Supabase migration** | 224 | Apply `supabase-readmodel/supabase/migrations/20261107000000_readmodel_devices.sql` to project `spmsgncjbnbkxvsbpqlu` (SQL editor, or `supabase db push --workdir supabase-readmodel`). Then run the checks in `supabase-readmodel/tests/assert_security.sql`. **Group Funds conflict:** if SPENDLY-678's `20261106000000` reaches main first or later, the second migration must restate the table lists with **both** sets of tables (see SPENDLY-224 doc). | ☐ |
| B5 | **Release a signed Expense Android build** | 691, 224, 226 | The release workflow, as usual. It ships sign-out cleanup, device registration, the Notifications settings card and the new Android channels. Back up the signing config before any prebuild. | ☐ |
| B6 | *(Optional)* **Web deploy** | 226 | Only to show the new Settings card on web. Web never registers for push. Skip while Netlify credits are low. | ☐ |

## C. Switch on (after B)

| # | Step | For | How | Status |
|---|---|---|---|---|
| C1 | **Your device registers** | 224 | Install the B5 build on your phone, sign in and allow notifications. Your `users/{uid}/devices/{installId}` document appears in Firestore, and a `devices` row appears in Supabase. | ☐ |
| C2 | **Test push to your own token only** | 223, 224 | Copy the token from your device document and send one push from https://expo.dev/notifications. Dev and prod share Firebase, so **never send to anyone else's token**. | ☐ |
| C3 | **Dry run of the job** | 692 | Actions → *Push reminders* → Run workflow, `dry_run = true`. Check the summary: `reads` and `readsToday` are well under the budget, and `engine.due` and `sent` look right. The log should show "[DRY RUN] would send …" lines only. | ☐ |
| C4 | **Turn it on** | 692, 693 | In this order:<br>1. Set `pushConfig/global.sendsDisabled = false`.<br>2. Set the repository variable `PUSH_REMINDERS_ENABLED = true` (the job then runs every 15 minutes).<br>3. **Once a scheduled run has succeeded**, set `system_settings/global.pushRemindersLive = true`. Registered phones then stop their own bill, calendar and goal reminders, because the server now sends them (693). Phones without push keep their local reminders. | ☐ |
| C5 | **Watch the first day** | 692, 227 | Check Actions run summaries for `reads` (the allowance is 6,000/day by default; tune `PUSH_MAX_READS_PER_DAY` and `PUSH_MAX_READS_PER_RUN`) and `stoppedForBudget`. In Firestore, `pushSendLogs` shows `errors` and `pruned`. Use the Firebase usage dashboard for total daily reads (the 50K Spark cap). | ☐ |

**Emergency stop**, any time:
1. Set `pushConfig/global.sendsDisabled = true`. This works immediately, no deploy needed.
2. **Also set `system_settings/global.pushRemindersLive = false`.** Phones then go back to scheduling their own reminders the next time they open Spendly. Without this, registered phones would get no reminders while sends are stopped.
3. Optionally also set `PUSH_REMINDERS_ENABLED = false`.

## D. Added by later stories (fill in as they merge)

| Story | What it adds to go-live |
|---|---|
| 231 Credit card bills | **Indexes, with B1/B2:** `creditCardBills.dueDate` field override (collection group) and the composite collection-group index `creditCardBills (status ASC, dueDate ASC)`. The bill source is already in `buildSources`. **Check after C4:** a bill paid in the app gets no further push. Its `creditCardBillReminderLogs` show `channel: "push"`. |
| 230 Tap routing + inbox | **Supabase migration `20261108000000_readmodel_notifications.sql`, applied after `20261107` in step B4.** The Group Funds note applies again. **Indexes, with B1/B2:** `notifications.createdAt` and `notifications.updatedAt` field overrides (collection group). **Read switch:** `readModel.notifications` starts as `firestore`. Move it to `shadow`, then `supabase`, like the other collections (READMODEL_RUNBOOK), after a clean parity run. **Check after B5:** tapping a push opens its screen. The inbox shows SIP updates, and reading one on a phone clears its badge on the other devices. |
| 694 Calendar reminders | **Indexes, with B1/B2:** `calendarReminders.recurrence` field override (collection group) and the composite collection-group index `calendarReminders (recurrence ASC, startDate ASC)`. The source is already in `buildSources`. **Check after C4:** a reminder marked done gets no push, and a reminder with a time arrives at that time. |
| 695 Dues | **Indexes, with B1/B2:** field overrides (collection group) `borrowings.dueDate`, `receivables.dueDate` and `subscriptions.isActive`. The source is already in `buildSources`. Dues only notify users who turned on "Loans, money owed and recurring payments" (off by default). **Check after C4:** a settled loan or an already-posted subscription gets no push. |
| 696 Savings goals | **Indexes, with B1/B2:** field overrides (collection group) `financialGoals.reminders.frequency` and `financialGoals.reminders.inactivityEnabled`. The source is already in `buildSources`, which completes the four reminder sources (bills, calendar, dues, goals). Goal pushes follow the Save Goals rollout flag. **Check after C4:** a goal marked reached or paused gets no nudge. |
| 693 Local to push handover | **No deploy.** The new flag `system_settings/global.pushRemindersLive` is set in step C4 (after a good run) and cleared in the emergency stop. **Check after C4:** on a registered phone, the scheduled local `ccbill:`/`cal:`/`goal:` notifications are gone and the pushes arrive. On a phone without push (or with permission off), local reminders still fire. |
| 229 SIP and EPF events | **Indexes, with B1/B2:** field overrides (collection group) `epfContributions.statusUpdatedAt` and `epfContributions.expectedCreditTo`. The SIP poll uses `notifications.createdAt`, from 230. Events are polled **hourly** (first quarter of each UTC hour) by the same workflow. **Check after C4:** a SIP run on one phone arrives as a push on the other. After the EPF cron's run on the 3rd, "EPF contribution expected" arrives and appears in the inbox. |
| 697 Shared splits and vaults | **No deploy.** No new indexes or rules; the source is already in `buildEventSources` (hourly). The "split settled" notice needs the app release (B5), which stamps `settledAt`. **Check after C4:** a new split notifies the other participants but not you. An "I paid" from the public page notifies only the organiser. A vault deposit notifies the other members. |
| 698, 225, 233 | *(pending)* |

## E. After everything is live

- [ ] Move every story and the epic to **Done** in Jira (they reach Done only when on `main`). Comment with the merge commit.
- [ ] SPENDLY-233: device QA matrix, delivery report, runbook, staged rollout (internal testers first, then everyone).
