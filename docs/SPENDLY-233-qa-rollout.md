# SPENDLY-233: Push notifications QA, monitoring and staged rollout

**Ticket:** [SPENDLY-233](https://kesavach.atlassian.net/browse/SPENDLY-233) (Story; Spendly only)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md), the [go-live checklist](SPENDLY-222-go-live-checklist.md) and the [runbook](PUSH_RUNBOOK.md).
**Branch:** `feature/SPENDLY-233-qa-rollout`, cut from the epic branch after the 698 switch was hidden.

## Built in this story

| Need | What |
|---|---|
| **Staged rollout: phones** | `system_settings/global.pushRemindersLiveFor: [uid]`. Listed users' phones hand reminders to push before everyone (`reminderMode`, `pushRemindersLiveForUser`). |
| **Staged rollout: server** | `pushConfig/global.allowUids: [uid]`. The sender only sends to listed users. It is checked **before** the send is claimed, so others still get the notice once added. The config document is read once per run, shared with the kill switch. |
| **Delivery report** | Actions → **Push delivery report** (`push-report.yml`, `scripts/push-report.ts`, `shared/utils/push/deliveryReport.ts`), read-only, using count() aggregations. It reports devices (and active ones), accounts with a device, sends, Expo acceptance (target ≥ 98%), opted out / no device, pruned devices, per-category counts and error codes, including receipt errors. |
| **Runbook** | [PUSH_RUNBOOK.md](PUSH_RUNBOOK.md): switches, emergency stop, staged rollout, a safe test push, the report, common errors, FCM key rotation |
| **Index** | `devices.lastSeenAt` collection-group override, for the report's "active devices" count |

**Audit doc criterion (decision D6):** `PUSH_NOTIFICATIONS_AUDIT_2026-09-27.md` was never committed, so its PN-1…PN-10 can't be marked. This epic's plan (§1 "Bugs found while planning") and the story docs now record each problem and its fix. The criterion is dropped.

## Device QA matrix

Run on a **signed Expense release build**, not the `.localtest` build, which has no FCM. Use Spendly Test data where possible. Real sends go only to the testers in `allowUids`. Before changing phone display settings, record and later restore `wm size` / `wm density` / nav mode / theme.

**Devices:** Android 10, 13, 14 and 15, including at least one Xiaomi, Oppo, Vivo or Samsung. iOS only if D4 is done.

| # | Case | Expected | Pass |
|---|---|---|---|
| 1 | Fresh install, first launch | **No** system permission prompt | ☐ |
| 2 | Settings → Notifications → Turn on notifications | Spendly's explanation, then the system dialog. The card shows "on". A `devices` doc appears. | ☐ |
| 3 | Deny twice (Android 13+), then try again | "Open settings" offered, and it opens the app's notification settings | ☐ |
| 4 | Mute "Credit card bills" in phone settings | The card names it as muted | ☐ |
| 5 | Bill due in 3 days; app in **foreground** on another screen | Banner at 09:00 (or the window start) | ☐ |
| 6 | Same, while on that bill's screen | No banner; the notice is still in the list | ☐ |
| 7 | App in the **background** / **swiped away** / **after a reboot** | The push arrives | ☐ |
| 8 | **Pay the bill on phone A** before 09:00 | **Phone B gets no reminder** | ☐ |
| 9 | Part-pay a bill | The reminder continues. It shows the remaining amount only with "Show amounts" on. | ☐ |
| 10 | Tap a bill push (cold start) | Opens that bill, once (no replay after sign-out and back in) | ☐ |
| 11 | Calendar reminder with a time (e.g. 18:30) | Arrives at 18:30. Marking it done before then means no push. | ☐ |
| 12 | SIP run on phone A | Phone B gets the push, and the Inbox shows it on both | ☐ |
| 13 | Read an update in the Inbox on A | The unread badge clears on B | ☐ |
| 14 | A friend marks "I paid" on the public split page | Only the organiser gets the push | ☐ |
| 15 | Delivery window 10:00–18:00; a reminder due at 09:00 | Arrives at 10:00 | ☐ |
| 16 | **Sign out** | The bill, calendar and goal local notifications are gone, the `devices` doc is deleted, and no push arrives | ☐ |
| 17 | **Switch account** on the same phone | Only the new account's pushes arrive | ☐ |
| 18 | Kill switch on (with `pushRemindersLive` off) | No push. The phone's own reminders come back at the next app open. | ☐ |
| 19 | Expense, Nutrition and Ganesh builds | Nutrition and Ganesh never register and show no Spendly notification UI. Expense works. | ☐ |

## Staged rollout

Internal testers, then everyone, as in [PUSH_RUNBOOK.md](PUSH_RUNBOOK.md#staged-rollout-spendly-233). The go-live checklist's C4 now uses the tester lists first.

## Tests

- `shared/utils/push/reminderMode.test.ts`: testers switch before everyone. Not listed, no uid, or a malformed list means local.
- `shared/utils/push/pushSender.test.ts`: only listed users; outside the rollout nothing is sent and the key isn't used; an empty list means everyone.
- `shared/utils/push/firestorePorts.test.ts`: the rollout list comes from the config document, read once per run.
- `shared/utils/push/deliveryReport.test.ts`: totals (ticket and receipt errors, categories, sends still in progress skipped), the formatted report (rates, no tokens), a quiet week.

## Open (owner)

- Work through the QA matrix on real devices, then the staged rollout.
- After everything is live: move the epic and its stories to Done (on main).
