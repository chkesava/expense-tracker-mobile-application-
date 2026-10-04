# SPENDLY-179: Financial Calendar month view and navigation

**Ticket:** [SPENDLY-179](https://kesavach.atlassian.net/browse/SPENDLY-179) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-179-calendar-month`, cut from the epic branch after 178 and merged back with approval.
**Depends on:** 177 and 178. No data model, no rules, no writes.

---

## 1. What users see
**Entry points:**
- the drawer item **Financial calendar** (`nav_calendar`, translated into all 7 app languages; not in the bottom nav, which keeps five tabs);
- the dashboard's **Upcoming Commitments** widget, which gets a **"View in calendar →"** link.

**`/calendar` screen:**
1. **Header** with previous and next month (each with a spoken label naming the target month), the month title, and **Today**. Today jumps back to the current month and selects today.
2. **Month grid:**
   - whole weeks, following the user's **first-day-of-week** setting;
   - six weeks when the month needs them, and leap Februaries handled;
   - days outside the month are dimmed;
   - today is outlined and the selected day is filled.
3. **Day marks drawn as shapes**, not only colours:
   - **filled dot** = money out;
   - **ring** = money in;
   - **square** = other (neutral, e.g. EPF or goals);
   - **"!"** = overdue.

   A legend under the grid explains them in words. Each day is one button with a full screen-reader sentence, for example "Sunday, 18 October 2026, selected, 2 payments, 1 overdue". Cells are at least 48dp.
4. **Partial data note:** "Some items couldn't load: …", or "Still loading some of your records…".
5. **"! N overdue from earlier":** expandable, so past unpaid items are never lost (178 `earlierOverdue`).
6. **Selected-day card:**
   - the full date;
   - totals: money out, money in, overdue count;
   - the day's events in display order.

   Each event row has a direction icon, title, **state in words** (Scheduled, Overdue, Done, Recorded, Expected…), source, and a signed amount. Tapping a row opens the source screen through the event's `href`. The richer detail sheet arrives in 181.
7. **States:**
   - **Loading:** a skeleton until the first events arrive.
   - **Error:** shown only when every source fails.
   - **Empty day:** a useful sentence instead of a blank space.

**Month swipe:** left out. The previous/next buttons are accessible and avoid fighting the app's horizontal tab-swipe gesture.

## 2. Code
| File | What |
|---|---|
| `shared/utils/calendarMonth.ts` (+test, 8) | Grid model (`buildMonthGrid`), day and event screen-reader sentences, day totals, state and source labels, month titles and navigation |
| `components/calendar/CalendarMonthGrid.tsx` | Grid plus legend (plain views, memoised) |
| `components/calendar/CalendarEventRow.tsx` | Event row, reused by the 180 agenda |
| `app/(app)/calendar/index.tsx` | The screen |
| `shared/config/navigation.ts` (+test) | `calendar` nav id, drawer item, active state, Android back |
| `shared/config/routeRestoration.ts` (+test) | Restorable `/calendar` |
| `components/SideDrawer.tsx` | Calendar icon |
| `providers/LocalizationProvider.tsx` | `nav_calendar` in 7 languages |
| `components/dashboard/SubscriptionsWidget.tsx` | "View in calendar" link |
| `app/(app)/_layout.tsx` | Route |

## 3. Acceptance criteria
| Criterion | How |
|---|---|
| The current month opens correctly | Month starts at `todayDateKey(settings.timezone)` |
| Previous and next work | Header buttons; titles tested across year ends |
| Today returns to today | Today button |
| Days with events are identifiable | Shape marks plus the screen-reader sentence |
| Several event types on one day stay understandable | Separate marks for out, in and other; ordered day list |
| Selected-day events are reachable without leaving | Day card under the grid |
| Overdue is distinguishable without colour | "!" mark, the "Overdue" word on rows, the earlier-overdue section |
| Month boundaries, leap years, year transitions | Grid tests (leap February, 6-week months, Sunday start), 178 range tests |
| Timezone preserved | Every date is a local date key from `settings.timezone` |

## 4. Manual testing guide
Use Spendly Test on the emulator.
1. Open the drawer → **Financial calendar**. The current month shows, with today outlined.
2. Add a card bill, a subscription and an income, then check each appears on its day with the right mark.
3. Tap days; the card below updates. Tap an event and check it opens the bill or the Recurring tab.
4. Go back several months and forward past December; tap **Today**.
5. Change the first day of the week in settings; the grid should follow.
6. Turn on TalkBack and swipe through the days. Each should read as a full sentence. Try large fonts.
