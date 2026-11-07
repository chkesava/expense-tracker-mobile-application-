# Spendly push notifications: developer guide

Read this before adding a push notification to any Spendly feature. It covers:
- what Spendly sends today;
- how a notice travels from the database to the phone;
- the exact steps and rules for adding a new one.

**Related docs:**
- Operations (switches, emergency stop, rollout, errors): [PUSH_RUNBOOK.md](PUSH_RUNBOOK.md).
- Why it's built this way: the epic [SPENDLY-222](SPENDLY-222-push-notifications.md) and its [plan](SPENDLY-222-plan.md).

**Scope:** Spendly (Expense) only. Ganesh and Nutrition never register a device and never receive these pushes.

---

## 1. What we send today

The phone always gets a notice, and a tap opens the screen it's about. Amounts and card digits appear only if the user turned on **Show amounts on the lock screen**; it's off by default.

### Reminders (about a date; checked every 15 minutes)

| Source (file in `shared/utils/push/sources/`) | Category: switch → Android channel | Notices (`kind`) | Sent when | Stops when |
|---|---|---|---|---|
| **Credit card bills** (`billSource.ts`, 231) | `bills`: bill reminders switch, plus each bill's own flag → `credit-card-bills` (high) | `bill_before`, `bill_due`, `bill_overdue` | The bill's chosen days before (auto bills: 3 and 1), on the due date, then every `overdueEveryDays` for up to 60 days. At 09:00. | The bill is **paid** or cancelled, nothing is left to pay, it's snoozed (`nextReminderAt`), the bill or its account is deleted, or the switch is off. Part paid keeps reminding with the amount still owed. |
| **My calendar reminders** (`calendarReminderSource.ts` + `calendarPush.ts`, 694) | `calendar`: "My reminders" → `financial-calendar` | `calendar_before`, `calendar_due`, `calendar_overdue` | Lead days before, on the day, and once the day after. At the reminder's own time (otherwise 09:00). | That occurrence is marked done, the reminder is deleted or past `untilDate`, or the switch is off |
| **Dues** (`duesSource.ts`, 695): loans, money owed to me, subscriptions, EMIs | `dues`: "Loans, money owed and recurring payments" (**off by default**) → `financial-calendar` | `calendar_before`, `calendar_due`, `calendar_overdue` | Lead days of 0, 1 or 3 before, on the day, and once overdue. Subscriptions and EMIs never get an overdue notice. | **Loans:** fully settled or closed. **Money owed:** fully settled or cancelled. **Subscriptions and EMIs:** inactive, completed, or the term finished. Also when the renewal is already posted this period. |
| **Save Goals** (`goalSource.ts`, 696) | `goals`: each goal's own reminder settings → `savings-goals` | `goal_scheduled`, `goal_inactivity` | Daily, weekly or monthly at the goal's time, and "nothing added in N days" | The goal is paused, completed, archived, cancelled or reached; its reminders are off; or the Save Goals rollout flag hides goals from the user |

**Bursts:** when three or more slots from one source are due for a user at once, they get **one summary** instead, e.g. "3 credit card bills need attention" (`SUMMARY_THRESHOLD`).

### Events (something happened; checked hourly with a 1-day lookback)

| Source (file) | Category → channel | Notices (`kind`) | Who gets it |
|---|---|---|---|
| **SIP runs** (`sipEpfEvents.ts`, 229) | `investments` → `investments` | `sip_executed`, `sip_failed`, `sip_skipped`. The text is the inbox row's own, written by the SIP run. | The plan's owner |
| **EPF** (`sipEpfEvents.ts`, 229) | `investments` | `epf_expected` ("EPF contribution expected"), `epf_late` ("EPF credit not seen yet") | The owner. Never once credited, missed or reversed. **Never includes amounts.** |
| **Shared splits** (`sharedEvents.ts`, 697) | `shared` → `shared-money` | `split_added`, `split_settled` | The other participants, **never the person who acted** |
| **Split "I paid" / opt-out** from the public page | `shared` | `split_claim_paid`, `split_claim_opt_out` | The organiser only |
| **Vault entries** | `shared` | `vault_entry` | Every member and the owner, except whoever recorded it |

Every event also gets an **inbox row** (`users/{uid}/notifications`, shown under Inbox → Updates), even when the push itself is opted out.

**Not live:** price alerts (`priceAlerts`, SPENDLY-698). They're blocked by SPENDLY-625, and the switch is hidden (`PRICE_ALERT_PUSH_AVAILABLE = false`).

---

## 2. How it works

```
Cloudflare Worker cron (*/15)                      GitHub schedule (fallback, unreliable)
        │ dispatches push-reminders.yml (trigger: cron)        │
        └────────────────────────┬──────────────────────────────┘
                                 ▼
   GitHub Actions job  ── scripts/push-reminders.ts → scripts/lib/pushRunCore.ts
     │  read budget (pushConfig/usage-{date}): 400 a run, 6,000 a day
     ├─ receipts: read Expo receipts and prune dead devices
     ├─ reminders: reminderEngine.runReminderTick(buildSources(db))   every run
     │     candidates → slotsFor(today) → in the delivery window?
     │       → reload(item) (fresh read)
     │       → still due? → sendToUsers
     ├─ events: events.runEventTick(buildEventSources(db))   hourly pass (minutes 0–14)
     │     poll(last 25 h) → create inbox row → sendToUsers
     └─ cleanup: delete pushSendLogs past expireAt (no TTL on Spark)   hourly pass
                                 │
                                 ▼
   pushSender.sendToUsers  (shared/utils/push/pushSender.ts)
     kill switch → rollout list → CLAIM pushSendLogs/{uid:key} (once, ever)
       → user's preferences → user's devices → Expo Push Service
                                 │
                                 ▼
   Expo → Firebase Cloud Messaging → phone (Android channel = category)
     tap → lib/notificationHandler → notificationRoutes (allow-list) → screen
```

The key ideas:

1. **Re-read at send time.** A reminder is planned from the item, then the item is **read again** just before sending. A bill paid a minute ago gets no reminder.
2. **Same rules as the phone.** Sources call the app's own planners (`parseStoredBill`, `planCalendarNotifications`, `planGoalNotifications`), so push and local reminders never disagree.
3. **Once, ever.** Every notice has an idempotency key: `{uid}:{slotId}` for reminders, `{uid}:{eventKey}` for events. The sender *claims* the key with a `create` in `pushSendLogs` before sending. Overlapping or double runs therefore can't send twice.
4. **Slot ids carry the date** (e.g. `ccbill:{billId}:due@2026-11-08`), so moving a due date creates a new slot instead of being blocked by the old one.
5. **Delivery window.** A slot outside the user's window waits for the next run inside it. Reminders expire at the end of the user's day; events expire after 24 hours.
6. **Exclusive mode** (693). When push is live for a user and the phone is registered with permission, the phone stops scheduling its own local reminders (`usePushReminderMode`). Otherwise it keeps them. It's never both, and never neither.
7. **Spark plan.** There are no Cloud Functions, Firestore triggers or TTL policies, so everything polls. Every query counts against 50K reads a day, shared by dev and prod.

**Switches** (details in the runbook):
- **Kill switch:** `pushConfig/global.sendsDisabled`.
- **Rollout lists:** `pushConfig/global.allowUids` (server) and `system_settings/global.pushRemindersLiveFor` (phones).
- **Everyone:** `system_settings/global.pushRemindersLive`.
- **Job on/off:** the repository variable `PUSH_REMINDERS_ENABLED`.

---

## 3. Adding push to a feature

### Step 0: decide which kind it is

| If the notice is about… | Build a | Example |
|---|---|---|
| a **date**: something is due, coming up, or overdue | **Reminder source** (`ReminderSource`, run every 15 minutes) | "Insurance premium due in 3 days" |
| something that **happened**: a run, a change, another person's action | **Event source** (`EventSource`, hourly, gets an inbox row) | "Your FD matured", "A friend paid you back" |

If it fits neither, for example an instant chat-style message, stop and discuss it first. There is no real-time path on Spark.

### Step 1: write the source

Put it in `shared/utils/push/sources/<feature>Source.ts` (reminder) or `<feature>Events.ts` (event). Copy the closest existing one. `billSource.ts` is the most complete reminder; `sipEpfEvents.ts` is the simplest event.

**A reminder source** implements this interface (`shared/utils/push/reminderEngine.ts`):

```ts
{
  name: "insurance",
  category: "dues",                       // an existing PushCategory, or add one (Step 3)
  candidates({ fromDate, toDate }),       // collection-group query(ies) across users; keep them narrow
  itemId(item),
  slotsFor(item, { today, settings }),    // PURE: [] when resolved, switched off or not due today
  reload(uid, itemId),                    // fresh read at send time; null if deleted
  summarize?(slots, ctx),                 // optional: one notice for 3+ due slots
  onSent?(uid, itemId, slot, status),     // optional: e.g. write the feature's own reminder log
}
```

A slot is `{ slotId, date, time, kind, title, body, url }`:
- **`slotId`:** stable and unique per user, **including the date**. Reuse the local notification id when the feature already has local reminders, so they match.
- **`time`:** `HH:mm` local time. The engine moves it into the delivery window.

**An event source** implements this (`shared/utils/push/events.ts`):

```ts
{
  name: "fd",
  category: "investments",
  poll({ sinceMs, nowMs, today }) → EventNotice[]   // what happened since sinceMs, re-read fresh
}
// EventNotice: { uid, key, kind, title, body, url, entityId, row?: { id, type } }
```

- **`key`** is unique per user **per event** (e.g. `fd:matured:{fdId}`). Re-polling the same event must produce the same key.
- **`row`** asks the engine to create the inbox row with `create`, so it never resets a row the user already read. Leave it out only if your feature writes its own row, as SIP does.
- **Never notify the actor.** Recipients come from the current document, never from anyone outside it.

### Step 2: register it

In `scripts/push-reminders.ts`, add it to `buildSources` (reminders) or `buildEventSources` (events).

### Step 3: category, preferences, channel (only for a new category)

Reuse an existing category whenever the user would expect the same switch. A new category touches all of these:
- `PushCategory` and, for an event-only category, `PushEventCategory`, plus `DEFAULT_PUSH_NOTIFICATIONS.categories` in `shared/utils/pushPreferences.ts`.
- `isPushCategoryEnabled`: map it to the feature's **existing** switch if it has one. Never add a second, conflicting toggle.
- `PUSH_CHANNELS`: an Android channel id, name and importance (`high` only for money that's due).
- The Notifications card: `components/settings/PushNotificationSettings.tsx`.
- The new channel reaches phones only with the next **app release**.

### Step 4: make the tap land

The `url` must be an in-app path under `PUSH_ROUTE_ROOTS` in `shared/utils/push/notificationRoutes.ts`. Add the feature's root there if it's new. Anything else opens the inbox instead.

### Step 5: rules every push must follow

- **Re-check before sending.** `slotsFor` and `poll` must return nothing once the thing is resolved: paid, done, deleted, settled, paused, switched off. Use the app's own helpers, not a copy of their logic.
- **No money on the lock screen** unless `settings.pushNotifications.showAmounts` is true. EPF and shared notices never include amounts.
- **Short, plain text.** Title under about 40 characters. The body says what and when. No marketing or emoji.
- **Only Spendly users and the right person.** Never the actor, and never someone outside the document.
- **Respect the read budget.** Narrow queries (date range, status) on indexed fields. No full-collection scans. Read only what's needed at send time.
- **Indexes.** A collection-group query needs a field override or composite index in `firestore.indexes.json`, deployed **before** the job uses it (runbook / go-live B1). `scripts/readmodelCrossUserIndexes.test.ts` and the dry-run index diff help.
- **Read model.** Inbox rows are a synced collection, and the engine notes them for Supabase. If your source writes anything else, follow [READ_MODEL_RULES.md](READ_MODEL_RULES.md): `noteDirectWrites` or the server push.
- **Dry run writes nothing.** Don't write in `candidates`, `slotsFor` or `poll`. Put writes in `onSent`, which a dry run skips (SPENDLY-715).
- **Local reminders.** If the feature also schedules on-device reminders, they must stand down when `usePushReminderMode()` returns `"push"`, as bills, calendar and goals do. Otherwise users get both.

### Step 6: tests (required)

Use the fakes in `shared/utils/push/testing/fakeAdminDb.ts` (`fakeAdminDb`, `memoryPushPorts`). Next to the source, in `*.test.ts`, cover:
- each `kind` produced on the right day and time;
- **every "stops when" case** (paid, done, deleted, switched off, part paid);
- slot ids include the date (moving a date creates a new slot);
- for events: no actor, the right recipients, a stable `key`, and the inbox `row`;
- no amounts unless `showAmounts` is on;
- `summarize`, if the source has one.

Then run `npx vitest run shared/utils/push scripts/pushRunCore.test.ts`, `npm run typecheck:shared` and `npx tsc --noEmit`.

### Step 7: docs and go-live

- Add a row to section 1 of this guide.
- Add a row to the go-live checklist, section D: indexes, and any app release the feature needs.
- If the feature needs new indexes: deploy them (dry run first), then run Actions → **Push reminders** with `dry_run` on, and check the summary before relying on it.

---

## 4. Testing a push safely

- **Never send to someone else's token.** Dev and prod share one Firebase project.
- **Dry run:** Actions → *Push reminders* → `dry_run: true`. It logs "[DRY RUN] would send …" and writes nothing.
- **Your phone only:** copy your own token from `users/{uid}/devices/{installId}` and send from https://expo.dev/notifications. Use the channel id of your category (e.g. `credit-card-bills`).
- **Staged rollout:** while a feature is new, `pushConfig/global.allowUids` limits real sends to testers.
- **Health:** Actions → **Push delivery report** shows acceptance, errors and dead devices per category.

## 5. Where things are

| What | Where |
|---|---|
| Engine (reminders) | `shared/utils/push/reminderEngine.ts` |
| Engine (events) | `shared/utils/push/events.ts` |
| Sender (claim, kill switch, rollout, preferences, Expo) | `shared/utils/push/pushSender.ts`, `firestorePorts.ts` |
| Sources | `shared/utils/push/sources/` |
| Job | `scripts/push-reminders.ts`, `scripts/lib/pushRunCore.ts`, `.github/workflows/push-reminders.yml` |
| Trigger | `cloudflare/push-trigger/` (Worker cron, SPENDLY-716) |
| Preferences and channels | `shared/utils/pushPreferences.ts`, `components/settings/PushNotificationSettings.tsx` |
| Device registration | `lib/pushRegistration.ts`, `hooks/usePushRegistration.ts` (`users/{uid}/devices`) |
| Tap routing and inbox | `shared/utils/push/notificationRoutes.ts`, `lib/notificationHandler.ts`, `app/(app)/inbox.tsx` |
| Local vs push | `shared/utils/push/reminderMode.ts`, `hooks/usePushReminderMode.ts` |
| Report | `scripts/push-report.ts`, `.github/workflows/push-report.yml` |
