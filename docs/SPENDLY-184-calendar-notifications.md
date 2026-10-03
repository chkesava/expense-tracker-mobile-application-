# SPENDLY-184: Financial Calendar reminders and notification behaviour

**Ticket:** [SPENDLY-184](https://kesavach.atlassian.net/browse/SPENDLY-184) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-184-calendar-notifications`, cut from the epic branch after 183 and merged back with approval.

**Decision (2026-10-03):**
- Notifications are **on-device** (expo-notifications), using the existing card-bill pattern.
- Remote push stays with SPENDLY-222.
- No rules, no server and no new collection.

---

## 1. What users see
**Settings → Automation → Financial calendar:**
- **My reminders:** on by default, because the user asked to be reminded. Each reminder uses its own "Remind me" setting from 183.
- **Loans, money owed and recurring payments:** **off by default** to avoid noise. It covers borrowing due dates, money owed to you, subscriptions and EMIs. Notify on the day, 1 day before or 3 days before.
- **Quiet hours:** not before 06:00–10:00 and not after 18:00–23:00.
- **Permission:** turning a switch on asks for notification permission. If it's denied, the card says notifications are off for Spendly in the phone settings.

**Each item gets at most three notices:**
- one before the due date (by its lead time);
- one on the day;
- one the day after, **only while it's still open**.

Copy examples: "Reminder: Renew insurance — Due in 3 days", "Repay Ravi — Repayment due tomorrow · ₹5,000", "Not done yet: …".

**Tapping a notification** opens `/calendar` on that day with the item's detail sheet open. That also works from a cold start, through the existing listener.

## 2. Behaviour (`shared/utils/calendarNotifications.ts`, `services/calendar/calendarNotificationScheduler.ts`)
- **Plan, then replace:**
  - The pure `planCalendarNotifications` decides which notifications should exist now.
  - The scheduler **cancels every `cal:` notification and schedules exactly that plan**, the same approach as `billReminderScheduler`.
- **Stable identity:** each notification id is `cal:{eventId}:{before|due|overdue}`, and event ids are `source:ref:date`. So refreshes, retries and app restarts never duplicate.
- **Completed or cancelled items stop:** they're no longer open, so they drop out of the next plan and their pending notifications are cancelled.
- **Rescheduled items move:** a new date means a new id. The old notification is cancelled, the new one scheduled, and nothing is duplicated.
- **Timezone:** fire times use `dateTriggerFromDateKey` with the user's timezone and quiet hours (reused from card bills). Changing timezone rebuilds the plan instead of adding to it.
- **Never in the past:** notices dated before today are skipped, and so are today's slots whose time has passed. An item overdue for more than a day gets no further notices.
- **Cap:** at most **30** calendar notifications, earliest first, over a 60-day horizon. That stays under iOS's 64 pending notifications and leaves room for card bills.
- **No duplicates with card bills:** card bills aren't planned here; they keep their own scheduler and settings. SIP runs aren't notified here either, because SIPs already have their own in-app notifications.
- **Safety:**
  - permission is never requested in the background;
  - nothing runs on web;
  - every failure is logged (`calendarNotifications.*`) and swallowed;
  - **no financial data is ever written.**

## 3. Where it runs
`components/calendar/CalendarNotificationSync.tsx` is mounted once in the app shell and renders nothing.
- **Data it uses:** what the shell already loads (recurring items, borrowings, receivables), plus the small reminders listener.
- **When both switches are off:** the reminders listener is disabled and every calendar notification is cancelled.
- **Debounce:** reconciliation waits 1 second, so a burst of updates schedules once.

**Tap routing:**
- **One tested allow-list:** `isRoutableNotification` lists `sms`, `credit_card_bill` and `calendar`, and accepts in-app `/` urls only.
- **Handler change:** `SmsReceiverProvider`'s handler now uses that list. SMS and card-bill taps behave exactly as before.

## 4. Settings data
`settings.calendarNotifications` holds `{ remindersEnabled, duesEnabled, duesDaysBefore, quietHoursStart, quietHoursEnd }`.
- It sits on the user settings document (an allowlisted key), next to `creditCardBillReminders`.
- `normalizeCalendarNotifications` repairs bad stored values.

## 5. Acceptance criteria → tests
| Criterion | How |
|---|---|
| Notification permission handled gracefully | Asked only from the switch; hint when denied; silent no-op otherwise |
| Each notification maps to a stable identity | `cal:{eventId}:{kind}`; "plans … with stable ids" |
| No duplicates across refresh or retry | Cancel-then-schedule; deterministic plan; test |
| Completed or cancelled items stop | "drops completed, cancelled and recorded items" |
| Rescheduled items update | "moves with a rescheduled item instead of duplicating" |
| Timezone changes don't duplicate | Rebuild on timezone change; user-timezone triggers |
| Tap opens the right context | `calendarFocusHref` → `/calendar?focus=&date=`; routing allow-list test |
| Failed scheduling doesn't corrupt data | Scheduler only touches notifications; failures are logged |
| Other notifications unaffected | Card-bill scheduler untouched; tap allow-list unchanged for sms/bills; tested |

**Tests:**
- 8 planner and routing tests.
- 2 settings tests.
- The scheduler wraps expo-notifications, so it needs a **device** check (see §6).

## 6. Manual testing guide (device)
Use Spendly Test on the emulator, Android or iOS.
1. Settings → Financial calendar: confirm **My reminders** is on and permission is granted.
2. Add a reminder for tomorrow with **1 day before** set. A notification fires today within quiet hours (a past slot is skipped). Tap it: the calendar opens on tomorrow with the reminder's sheet open.
3. Mark it done. Its remaining notifications are cancelled.
4. Turn on **Loans, money owed…**, and give a borrowing a due date in 2 days. Check its notices are scheduled. Change the due date; the old ones go and new ones appear.
5. Turn both switches off. Every calendar notification is gone, while card-bill reminders still arrive.
6. Change the app timezone and reopen. There should be no duplicate notifications.
