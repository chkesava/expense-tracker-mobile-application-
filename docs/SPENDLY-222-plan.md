# SPENDLY-222: Spendly push notifications plan

**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222)
**Epic branch:** `feature/SPENDLY-222-push-notifications`, cut from `origin/main` 73db1556 on 2026-11-06.
**Worktree:** `C:\dev\worktrees\spendly-222`. Its `node_modules` is a junction to the main checkout, so start Expo with `--clear`.
**Tracker:** [SPENDLY-222-push-notifications.md](SPENDLY-222-push-notifications.md)

## 0. Scope (changed by the user on 2026-11-06)

**In scope:** remote push for **Spendly (Expense) only**. It covers every reminder and every important event in Spendly's features, so that each notification arrives on every signed-in device, even when the app hasn't been opened. Each reminder **stops as soon as its reason is gone**: a bill is paid, a loan is settled, a goal is reached, and so on.

**Out of scope:**
- **Ganesh Seva and Nutrition.** Story 228 moves out of the epic. Nutrition gets nothing.
- **SMS alerts.** Story 232 is won't-do, because SMS detection was removed in SPENDLY-486.
- Web push, and marketing pushes.

## 1. Where things stand

| Area | Repo today |
|---|---|
| Remote push | None. Nothing registers a token, stores one or sends a push. |
| Credit card bills | Local reminders from `services/creditCardBills/billReminderScheduler.ts` (`reconcileBillReminders`). Slots: 7/3/1 days before, the due date, then overdue repeats. Timing: 09:00, clamped into the delivery window. ID format: `ccbill:{billId}:…`. Channel: `credit-card-bills`. |
| Financial calendar | Local reminders from `shared/utils/calendarNotifications.ts` + `services/calendar/calendarNotificationScheduler.ts`. Covers user reminders, borrowings, receivables, subscriptions and EMIs. ID format: `cal:{source}:{refId}:{date}:{kind}`. |
| Save goals | Local reminders from `shared/utils/goalReminders.ts` + `services/goals/goalReminderScheduler.ts`. Two kinds: a scheduled nudge and an inactivity nudge. ID format: `goal:{goalId}:…`. |
| SIP | Inbox rows only: `users/{uid}/notifications`, written by `services/sip/executeSips.ts` and shown in `SipNotificationsModal`. No phone notification. |
| EPF | `netlify/functions/epf-cron.ts`, run monthly by a GitHub Action. No notification. |
| Splits and vaults | Top-level `splits`, `splitShareClaims`, `vaults/{id}/expenses`. All written by the client. No notification. |
| Price alerts | `users/{uid}/alerts` is stored but never evaluated. SPENDLY-625 owns evaluation. |
| Inbox | App-bar bell → `app/(app)/inbox.tsx`. It is computed (`RemindersInboxProvider`), and "seen" is stored per device. It does **not** show the `notifications` rows. |
| Tap routing | `hooks/useNotificationTapRouting.ts`. Allow-list: `credit_card_bill`, `calendar`, `goal`. |
| Server runtime | The Cloud Functions codebase `ganesh` is deployed. Netlify credits are low. |

**Bugs found while planning. Push fixes them, or a story here owns them:**
1. **Payment on another device.** Reminders are scheduled locally on each device. A bill paid on phone A keeps reminding on phone B until B opens the app.
2. **Sign-out.** Sign-out doesn't cancel local `ccbill:`, `cal:` or `goal:` notifications, so a previous user's reminders fire on a shared device.
3. **Permission prompt.** Bill reconcile calls `requestPermissionsAsync`, so the OS prompt can appear on app launch with no context.
4. **Partial payment amount.** The bill copy shows `statementAmount` even after a partial payment. It should show `remainingAmount`.
5. **Snooze.** Snooze writes `nextReminderAt`, but the scheduler never reads it.
6. **Subscription "due today".** It fires even after the charge was auto-posted, because the planner ignores `lastProcessed`.
7. **Two delivery windows.** Bills and calendar each keep their own copy of the window; goals ignore it entirely. No window can cross midnight.
8. **iOS limit.** iOS allows 64 pending local notifications per app, and bills, calendar and goals all share it.

## 2. Target design

**The server decides and sends. The device only displays.**

1. **Reminder engine.** A scheduled server job runs every 15 minutes:
   - It finds the reminder slots that are due now in each user's timezone and delivery window.
   - **It re-reads the source document from Firestore at send time** and sends only if it is still open. That one check makes "paid → stop" correct by construction.
   - It reuses the existing pure `shared/utils` helpers (`computeCreditCardBillStatus`, `shouldSendBillReminder`, `planCalendarNotifications`, `goalCanRemind`). There is no new ledger and no second status logic.
2. **Delivery ledger.** `users/{uid}/pushDeliveries/{slotId}` gives each slot an idempotency key (the same IDs as today's local reminders), so a retry or re-run never double-sends. It also feeds the delivery report.
3. **Event pushes.** Pushes for things that happen (a SIP runs, EPF is credited, a split member pays, a price alert fires) come from Cloud Function triggers or the existing crons. They go through the same sender, each with its own idempotency key.
4. **Local fallback.** Local reminders stay only for devices that can't get push (no token, Expo Go, local test build). When this device's push is active, the client stops scheduling local reminders for the kinds the server covers. That removes bug 1 and the duplicates.
5. **Data payload.** Every push carries `data = { product:"expense", source, kind, url, entityId }`. The router extends the existing allow-list. Every push also gets a matching inbox row.

## 3. Edge cases (each story must cover its own)

### Common to every reminder

| Case | Required behaviour |
|---|---|
| Source resolved before the slot (paid, settled, completed, cancelled, deleted) | Not sent. The engine re-checks at send time. |
| Resolved after a push was sent | No more slots. Any local fallback on the device is cancelled at its next reconcile. |
| Resolved while offline (the write is still in the device outbox) | The server can't see it yet, so one stale reminder can go out. Accepted. The tap opens the entity, which shows it as paid. |
| Due date or amount edited | Slots are recomputed from the current document at send time. The ledger key includes the slot date, so a moved date never suppresses the new slot. |
| Feature, category or item reminder turned off | Not sent. Checks run in this order: global push off, then category off, then item `reminderEnabled === false`. |
| Delivery window | Uses the user's `settings.timezone`. A slot that falls outside the window waits for the next window opening, and only if it is still relevant that day. One window setting, which may cross midnight (bug 7). |
| Server was down or a run was missed | It catches up only the latest pending slot per item, never a backlog. A day-old "due in 3 days" is dropped. |
| First enable or fresh install with old overdue items | One summary push at most, not one push per old slot. |
| Push stays undelivered | TTL: the push expires at the end of its slot day, so a "due today" never arrives tomorrow. A collapse key per item means the newest notice replaces older ones. |
| Several devices | Every device registered to the user gets the push. The ledger records one send per slot. |
| Sign-out, account switch, account deletion | The device token is removed or moved. Local reminders are cancelled on sign-out (bug 2). Account deletion purges devices and deliveries. |
| Permission denied or token dead | No send to that token. `DeviceNotRegistered` prunes it. Settings shows how to recover. |
| Lock-screen privacy | Amounts and the card's last 4 digits on the lock screen are a user preference. Decision D7 sets the default. |
| Kill switch | A config flag stops all sends without a deploy. |

### Credit card bills (story 231)
- **Stop when:** `computeCreditCardBillStatus` on the server returns `PAID` or `CANCELLED`, or `remainingAmount <= 0`. The stored `status` can be stale, so the server never trusts it.
- **Partial payment:** keep reminding, and show `remainingAmount`, not `statementAmount` (bug 4).
- **Statement regenerated:** reminders use the new amount. PAID and CANCELLED bills stay silent unless the user recalculates them.
- **Duplicate bills from the legacy cron:** skip CANCELLED bills, and dedupe by `accountId + statementDate` (SPENDLY-676).
- **Missing account, or bill deleted:** no send.
- **Snooze:** honour `nextReminderAt` (bug 5).
- **Overdue:** repeat every `overdueEveryDays` for 60 days at most, then stop.
- **Settings:** per-bill `reminderFrequency` beats the global defaults. Auto bills keep 3/1 days.

### Financial calendar reminders (694)
- **Done occurrence:** a date in `completedDates[]` is never notified.
- **Recurrence:** only the next open occurrence is notified. Nothing after `untilDate`.
- **Deleted reminder:** nothing sent.
- **Reminder time:** honour the reminder's `time` field instead of the fixed 09:00 (decision D8).
- **Overdue:** notify once, on the next day.

### Dues: borrowings, receivables, subscriptions, EMIs (695)
- **Borrowings:** stop at `FULLY_SETTLED` or `CLOSED`. A manual close wins.
- **Receivables:** stop at `FULLY_SETTLED` or `CANCELLED`.
- **Subscriptions:** stop when `!isActive` or `isCompleted`, or when the EMI's end month has passed.
- **Already posted:** skip "due today" when `lastProcessed` already covers that occurrence (bug 6).
- **Transfers:** never notify.
- **`dueDuesEnabled`:** stays off by default, as today.

### Save goals (696)
- **Stop when:** status is paused, completed, archived or cancelled, or the target has been reached.
- **Inactivity:** a contribution resets the counter. Measure from `lastContributionAtMs` at send time.
- **Feature flag:** respect the `saveGoals` system flag.
- **Timing:** the goal's own time, inside the delivery window.

### SIP and EPF events (story 229)
- **SIP:** one push per `sipTransactions/{planId_date}` for executed, failed or skipped, keyed by that doc ID. Both the app and the legacy cron write these docs, so the ID dedupes the two. Paused or cancelled plans are silent.
- **EPF "expected":** when the cron creates the expected row. Idempotent per row.
- **EPF "not credited yet":** once, after `expectedCreditTo` passes with the status still `expected`. Never once the status is credited, missed or reversed.

### Shared splits and vaults (697)
- **Who gets it:** the other members only, never the actor. Recipients are the current `participantIds`/`memberIds` at send time.
- **Soft deletes:** a soft-deleted split (`deletedAt`) is silent.
- **Anonymous claims:** a `splitShareClaims` "I paid" goes to the organiser only, once per claim ID.
- **Settled splits:** no more "pending" notices.

### Price alerts (698, blocked by SPENDLY-625)
- **Event:** one push per trigger event, keyed by 625's `eventId`.
- **Stop when:** the alert is deactivated or deleted.
- **Shared delivery path:** it uses 625's delivery interface. There is no second alert path.

## 4. Stories (Spendly only)

| Order | Story | Blocked by | Summary |
|---|---|---|---|
| 1 | **691** Sign-out clears local reminders | — | Fixes bug 2 now. Small and independent. |
| 2 | 223 Credentials (Spendly) | — | FCM v1 for the Expense Android app. iOS optional (D4). |
| 3 | 224 Device registration (Spendly) | 223 | `users/{uid}/devices/{installId}`, rules, delete-account. |
| 4 | 226 Preferences + one delivery window | — | Spendly categories, a window that can cross midnight, Android channels. |
| 5 | 227 Push sender | 224, 226 | Expo push, batching, receipts, pruning, TTL/collapse, kill switch, logs. |
| 6 | **692** Reminder engine | 227 | Scheduled job, send-time recheck, `pushDeliveries` ledger, catch-up rules. |
| 7 | 230 Router + unified inbox | — | Push sources in the allow-list. Inbox shows notification rows, with synced read state. |
| 8 | 231 Credit card bill reminders | 692 | All the bill edge cases above. |
| 9 | **693** Local fallback handover | 692, 231 | Stop local scheduling when push is active, plus dedupe. |
| 10 | **694** Calendar reminders | 692 | |
| 11 | **695** Dues reminders | 692 | |
| 12 | **696** Goal reminders | 692 | |
| 13 | 229 SIP + EPF events | 227 | |
| 14 | **697** Splits and vaults activity | 227 | |
| 15 | **698** Price alert push | 227, SPENDLY-625 | |
| 16 | 225 Contextual permission | — | Removes the launch-time prompt (bug 3). Can be done any time. |
| 17 | 233 QA, monitoring, rollout | all | Signed Expense build only. |

**Candidates, not yet created:** budget at 80% or over budget, investment maturity, decision review dates (decision D9).

## 5. Invariants

1. A push only goes to the owner's own devices, or to the current members of a shared item. It never goes to another user.
2. A reminder is sent only if the source is **still open when sent**, judged by the existing shared helpers. There is no parallel status logic and no recomputed balances.
3. Each slot or event is sent at most once (ledger, idempotency key).
4. One notification system: extend the router, the inbox and 625's interface.
5. No secrets in the repo, and no tokens in logs.
6. Ganesh and Nutrition are untouched.
7. Shared Firebase: rules, indexes, functions and any backfill need a dry run or diff, and the user's approval.
8. Dual write: inbox rows and preferences go through the read model. `devices` and `pushDeliveries` are server-only and need the user-approved exemption (decision D2).

## 6. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Transport | Expo Push Service |
| D2 | Read-model exemption for `devices` and `pushDeliveries` | Exempt: server-only, and tokens are sensitive. Record it in the guard allowlists. |
| D3 | Where the engine and triggers run | Cloud Functions: a new `spendly` codebase, with scheduled and Firestore triggers. Not Netlify, because credits are low. |
| D4 | iOS | Android first, unless an Apple developer account and APNs key exist. |
| D5 | Ganesh story 228 | Move it out of the epic, and keep it for a later Ganesh epic. |
| D6 | The missing audit doc | Drop that acceptance criterion from 233. |
| D7 | Amounts on the lock screen | Hidden by default ("Your HDFC card bill is due in 3 days"). The user can opt in to showing them. |
| D8 | Calendar reminder `time` | Honour it, inside the delivery window. |
| D9 | Budget, maturity and decision-review pushes | Later, as separate stories once the core is live. |

## 7. Deploys (none without approval)

- Firestore rules for `devices`, `pushDeliveries` and prefs, plus rules tests.
- A TTL policy and indexes (collection-group queries on open bills and due items). Diff against live first.
- A new Cloud Functions codebase, with Cloud Scheduler.
- Supabase migration(s) for inbox rows and prefs.
- Expo push credentials in EAS (by the user).
- A signed Expense Android build. Back up the signing config before prebuild.
