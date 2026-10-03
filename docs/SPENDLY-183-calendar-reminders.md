# SPENDLY-183: User-created financial reminders and recurring calendar events

**Ticket:** [SPENDLY-183](https://kesavach.atlassian.net/browse/SPENDLY-183) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-183-calendar-reminders`, cut from the epic branch after 182 and merged back with approval.
**Depends on:** 177 and 182. **New data and rules:** `users/{uid}/calendarReminders`.

---

## 1. What users see
**Ways to add a reminder:**
- the **+** in the calendar header;
- **Reminder** in the global + sheet (*"A dated note on your financial calendar"*), which opens the calendar with the editor ready.

**The editor:**
- **Title** (required, up to 120 characters).
- **Date:** YYYY-MM-DD, with Today, Tomorrow and In a week chips.
- **Optional time** (HH:mm) and **optional amount**. The amount is shown on the calendar only and is never counted as money.
- **Category:** Bill, Insurance, Investment, Tax, Subscription, Review, Other.
- **Repeat:** Once, Every month, Every year, or Every N days, with an optional **Until** date.
- **Remind me:** on the day, 1 day, 3 days or 1 week before. This is stored now and used by 184.
- **Note:** up to 500 characters.

The editor says plainly: *"A reminder is a note on your calendar. It never records an expense or income."* Validation messages are written as sentences.

**On the calendar**, reminders are their own source ("Reminder"), shown as **neutral** events with a square mark in the month grid. Each occurrence is:
- **Scheduled**;
- **Overdue** when its date has passed and it isn't done;
- **Done** when completed. Completed occurrences stay on the calendar, so the history stays readable.

**A reminder's detail sheet** offers **Mark as done / Mark as not done** (for that occurrence), **Edit reminder** and **Delete reminder**. Delete asks first, and for a repeating reminder it says every repeat is removed.

## 2. Rules for occurrences
- **One-time:** stays on its date and becomes overdue afterwards. It is never moved to today.
- **Monthly:** on the start day, clamped to short months (31 → 30 → 28/29).
- **Yearly:** 29 Feb falls on 28 Feb in non-leap years.
- **Every N days:** from the start date.
- **Range:** occurrences never start before the start date and stop at Until.
- **No duplicates:** one event per reminder per date, with id `reminder:{id}:{date}`.
- **Completion:** stored per occurrence in `completedDates`, which is idempotent and capped at 400.
- **Timezone:** dates are local date keys. Changing timezone doesn't create or duplicate occurrences, because occurrences are computed rather than stored.
- **Not money:** reminders are **neutral**, so the 182 cash summary never adds them, even with an amount.

## 3. Data and security
`users/{uid}/calendarReminders/{id}` stores:
- `title`, `startDate`;
- optionally `time`, `estimatedAmount`, `intervalDays`, `untilDate`, `note`;
- `category`, `recurrence`, `remindDaysBefore`;
- `completedDates[]`, `createdAtMs`, `updatedAtMs`.

**The rule (`calendarReminderWellFormed`):**
- owner and duress twin only;
- `hasOnly` plus required keys;
- **no ledger-shaped fields:** `amount`, `date` and `accountId` are rejected;
- closed enums;
- formatted dates and times;
- bounded sizes and amounts;
- an integer interval of 1–366 when repeating every N days;
- `completedDates` is a list of at most 400;
- `createdAtMs` is pinned on update.

**Writes:**
- Saves go through `commitMutations`, the offline outbox, so a change made offline is queued and the toast says it will sync.
- Optional fields are omitted rather than written as undefined.
- A write never touches an expense, income or bill.

The listener (`useCalendarReminders`) mounts only on the calendar screen.

## 4. Acceptance criteria
| Criterion | How |
|---|---|
| Create, edit and delete | Editor and detail-sheet actions |
| One-time and supported repeats work | Occurrence tests (monthly clamp, yearly leap, every-N, until) |
| Completed reminders stay understandable | Shown as Done on their date |
| Visually distinct from ledger events | Own "Reminder" source and neutral mark; the state is in words |
| Never creates an expense, income or bill | The store writes only `calendarReminders`; rules reject ledger fields |
| No duplicate repeat instances | Stable per-date ids; tested |
| Timezone changes handled | Computed occurrences on local date keys |
| Persists across restarts and sync | Firestore and outbox |
| Offline doesn't lose changes | Outbox; toast shows the queued state |
| Firebase rules and security tests | `firestore/calendarReminders.rules.test.ts` (5) and `calendarReminder.rules.contract.test.ts` (3) |

## 5. Files
| File | What |
|---|---|
| `shared/types/calendarReminder.ts` | Type, enums, limits |
| `shared/utils/calendarReminders.ts` (+test, 9) | Validation, schedule, occurrences, completion, Firestore document |
| `shared/utils/calendarQuery.ts` | Reminders as a calendar source |
| `services/calendar/reminderStore.ts`, `hooks/useCalendarReminders.ts` | Writes and listener |
| `components/calendar/ReminderEditorSheet.tsx`, `CalendarEventSheet.tsx` | Editor and reminder actions |
| `app/(app)/calendar/index.tsx` | Header +, editor, `?newReminder` and `?reminder=&date=` links |
| `shared/config/addActions.ts` (+test), `components/AddActionSheet.tsx` | "Reminder" in the + sheet |
| `firestore.rules`, `firestore/calendarReminders.rules.test.ts` | Rule and emulator tests |

## 6. Rollout
Deploy the Firestore rules (**rules only, no indexes**) before the app. Without them, saving a reminder fails with a permission error.

## 7. Manual testing guide
1. Use the **+** sheet → **Reminder** to create "Renew insurance", yearly, with an amount. It appears on the calendar as a neutral Reminder, and the cash summary doesn't change.
2. Create a monthly reminder on the 31st and check November shows the 30th.
3. Open an occurrence → **Mark as done**. It reads Done and the next month's occurrence is unaffected.
4. **Edit** the title; **Delete** asks first and removes every repeat.
5. In airplane mode, add one. The toast says it will sync, and after reconnecting it's still there.
