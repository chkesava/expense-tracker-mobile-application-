# SPENDLY-185: Financial Calendar QA, accessibility, performance and product analytics

**Ticket:** [SPENDLY-185](https://kesavach.atlassian.net/browse/SPENDLY-185) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-185-calendar-qa`, cut from the epic branch after 184.

**Status:** partial by agreement (2026-10-03), like the runway and decision epics.
- Everything that can be verified in code is done.
- **Device QA is open:** TalkBack, dynamic fonts, Android performance, real notifications.
- **185 stays In Progress, and the epic is not Done.**

---

## 1. End-to-end suite (`shared/utils/calendar.qa.test.ts`, 12 tests)
One realistic data set goes through every layer: adapters → query → month grid → agenda → cash summary → notification plan. The data set covers:
- card bills (open, overdue, paid);
- rent on the 31st, an EMI and a transfer;
- loans with and without amounts;
- money owed to you, with and without a date;
- recorded salary;
- a goal deadline;
- FD maturity;
- a SIP;
- EPF;
- a yearly reminder with an amount.

| Guarantee | Result |
|---|---|
| Every event traces to its record | Each event's `refId` exists in its source; amounts equal the record (bill remaining, loan outstanding, receivable outstanding, recorded income) |
| Nothing unsourced | Transfers and undated receivables never appear |
| No mutation | All source records are byte-identical after querying |
| No duplicates | Overlapping month grids give the same ids; 0 duplicates dropped |
| Views agree | The grid's day counts sum to the events; the agenda contains every event plus earlier overdue items |
| Cash summary is honest | Only open, dated, same-currency money counts. Recorded salary, EPF, the goal and the reminder never add money. An amountless loan is listed, not guessed. The projection equals counted + in − commitments − overdue |
| Notifications | Open items only; never card bills (their own scheduler) or recorded income; never in the past; reminders use their own lead time |
| Boundaries | Day-31 rent → 31 Dec, 31 Jan, **29 Feb 2028**, 31 Mar |
| Time | Results depend only on the local "today" key; the same day gives the same answer, and the next day turns an unpaid bill overdue |
| Privacy | Every `logError`/`logWarning` in calendar code passes a scope and the error only (checked statically) |
| Performance | 20,000 income records, 300 recurring items and 300 monthly reminders run through all five layers in under 2s (Node) |

**Per-story suites:**

| Story | Test file | Tests |
|---|---|---|
| 177 | `calendarSources.test.ts` | 15 |
| 178 | `calendarQuery.test.ts` | 11 |
| 179 | `calendarMonth.test.ts` | 8 |
| 180 | `calendarAgenda.test.ts` | 8 |
| 181 | `calendarActions.test.ts` | 4 |
| 182 | `calendarSummary.test.ts` | 6 |
| 183 | `calendarReminders.test.ts` | 9 |
| 183 | `calendarReminder.rules.contract.test.ts` | 3 |
| 183 | `firestore/calendarReminders.rules.test.ts` (emulator) | 5 |
| 184 | `calendarNotifications.test.ts` | 8 |
| 184 | settings tests | 2 |

## 2. Functional QA coverage
| Area | Where it's covered |
|---|---|
| Month and year navigation, month and year ends | 179 grid tests, 178 grid range, QA §4 |
| Leap years | 177, 178, 179 and 183 tests, QA §4 |
| Timezone changes | Every date is a local key from `settings.timezone`; reminders are computed, not stored (183); notifications are rebuilt (184) |
| Several events on one day | 178 ordering, 179 marks, QA §3 |
| Overdue | Every layer; the earlier-overdue section |
| Cancelled and completed | 178 visibility, 182 exclusion, 184 notifications |
| Missing amounts and dates | 177 rules, 182 "without amount", QA §5 |
| Repeating events and user reminders | 177 (subscriptions, SIP), 183 |
| Source deep links | 181 actions; `?id=` modal links |
| Projection | 182 tests, QA §3 |
| Offline and partial data | 178 load states; reminders through the offline outbox (183) |
| Firebase sync | Live listeners; the calendar reads existing providers |

## 3. Security and privacy
| Collection | Protection |
|---|---|
| `users/{uid}/calendarReminders` (183) | Owner and duress twin only; `hasOnly` plus required keys; **ledger fields rejected**; enums, formats and bounds; `createdAtMs` pinned |
| Settings `calendarNotifications` (184) | On the settings document, an allowlisted key; normalised on read |

**Other privacy points:**
- Everything else in the calendar is **read-only** derived data.
- Notifications carry only the title, amount and an in-app url.
- Taps are routed through a tested allow-list, so external urls are ignored.

## 4. Analytics and observability
**No new analytics SDK was added.** Usage and failures are observed through the existing `lib/errors` scopes:

| Scope | Signal |
|---|---|
| `snapshot.calendarReminders` | Reminder listener failures. A spike in permission errors means the rules weren't deployed |
| `snapshot.sipPlans` | The calendar's SIP plans listener |
| `calendar.reminder` | Reminder save, complete or delete failures |
| `calendarNotifications.reconcile` / `.schedule` / `.cancel` | On-device scheduling failures, which are non-fatal |
| `firestoreWrite.lateFailure` with label `reminder` | Outbox writes that failed after syncing |

Product usage (calendar opens, view switches, reminder creation) has **no event pipeline in Spendly today**. Adding one is out of scope and a separate decision, noted as a limitation.

## 5. Known limitations
1. **No expected-salary record exists,** so income appears only once recorded. The cash summary says so.
2. **Subscriptions charged to a card** count as an outflow on the renewal date, not when the card bill is paid. This is conservative.
3. **Dates are typed** (YYYY-MM-DD), with quick chips, but there's no native date picker, matching the rest of the app.
4. **No month swipe;** buttons are used instead, to avoid clashing with the tab-swipe gesture.
5. **SIP runs aren't notified** by the calendar, because SIPs have their own in-app notifications. Card bills keep their own scheduler.
6. **Notification fire time** is 09:00 clamped to quiet hours. A reminder's own time is shown, but it doesn't set the notification time.
7. **Fee, decision and runway calendar sources** (SPENDLY-320, 367, 209) aren't wired here. They join through `extraEvents` or new adapters when those stories are picked up.

## 6. Rollout, rollback and monitoring
**Rollout order:**
1. **Deploy the Firestore rules (rules only, no indexes)** for `calendarReminders`, plus the runway rules from PR #212, before any app release.
2. **Merge runway PR #212 to `main` first.** This epic is built on top of it.
3. Merge this epic with explicit approval, once the open items are accepted or done. Expect small route-list conflicts with #210 and #211.
4. Release the app through the normal workflow. No native module was added; `expo-notifications` is already in use.
5. After release, move the stories to Done.

**Rollback:**
- **App:** revert the merge and release. The routes and entry points disappear.
- **Notifications:** `cal:` notifications go when the app no longer schedules them. Users can also turn the switches off.
- **Data:** reminders are additive, so there's nothing to migrate. Leftover documents are inert.
- **Rules:** harmless if left in place.

**Monitoring:** use the scopes in §4.

## 7. Device QA checklist (open)
Use **Spendly Test** against the local emulator (`docs/LOCAL_TEST_MODE.md`), never the real app. Record the display size, density, navigation mode and theme first, and restore exactly those afterwards.

- [ ] Run the manual guides in the 179–184 docs, end to end.
- [ ] **TalkBack:** month grid days, the legend, event rows, the agenda headings and "Next financial event", the summary lines, the detail and reminder sheets.
- [ ] **Large font scale:** grid cells, summary card and editor stay readable without clipping. Check the light and dark themes and a non-default accent.
- [ ] **Performance:** with seeded data (about 2,000 bills and incomes, 200 recurring items, 100 reminders), check:
  - [ ] cold open of `/calendar`;
  - [ ] month switching;
  - [ ] agenda scrolling over 30 days;
  - [ ] background and foreground transitions;
  - [ ] memory after repeated navigation.
- [ ] **Notifications on Android and iOS:**
  - [ ] permission prompt and the denied hint;
  - [ ] a reminder notifies before and on the day;
  - [ ] tapping opens the item, from both a warm and a cold start;
  - [ ] marking done cancels the rest;
  - [ ] a rescheduled loan moves;
  - [ ] switching off clears everything;
  - [ ] card-bill reminders are unaffected;
  - [ ] there are no duplicates after a timezone change.
- [ ] **Offline:** add, complete and delete reminders in airplane mode; check the toasts, then that they sync.
- [ ] **Signed release build:** `assembleRelease` with the release key (back up and restore signing around any prebuild). Smoke-test the above.
