# SPENDLY-180: Day and week financial agenda

**Ticket:** [SPENDLY-180](https://kesavach.atlassian.net/browse/SPENDLY-180) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-180-calendar-agenda`, cut from the epic branch after 179 and merged back with approval.
**Depends on:** 177 and 178. No data model, no rules, no writes.

---

## 1. What users see
`/calendar` now has a **Month / Agenda** switch. Going to Agenda starts from the day selected in the month view.

**Agenda:**
- **Period:** **This week** (following the user's first-day-of-week setting) or **Next 30 days**.
- **Navigation:** previous and next period, the period title (e.g. "12–18 October 2026", or "28 December 2026 – 3 January 2027" across a year end), and **Today**.
- **Overdue first:** an **! Overdue (N)** section at the top, with overdue items in the period plus those from the past 12 months (178 `earlierOverdue`).
- **Date groups:** chronological, each headed with the full date ("Friday, 16 October 2026 · Today"). Tapping a heading **goes back to the month view with that day selected**.
- **Next financial event:** the first open (scheduled or expected) event from today on, marked by the words "Next financial event" and a side bar.
- **Event rows:** the same rows as the month view (179): direction icon, title, state in words, source, signed amount. Tapping one opens the source.
- **Empty periods:** "No financial events in this period.", or "Nothing else scheduled in this period." when only overdue items exist.
- **Loading and partial states:** the same as the month view.

**Performance:** the agenda is a **FlashList** with `getItemType` (section, event or empty), so long periods scroll smoothly. Building 5,000 rows takes well under 300ms in tests.

## 2. Ordering
Rows follow 178's deterministic order: date → time → priority (overdue first) → direction (out, in, neutral) → source → title → id. Same-day order is therefore stable across refreshes (tested).

## 3. Code
| File | What |
|---|---|
| `shared/utils/calendarAgenda.ts` (+test, 8) | `agendaRange` (locale week or 30 days), `shiftAgenda`, `agendaTitle`, `buildAgendaRows` (overdue section, date groups, next event, empty state), `nextFinancialEvent` |
| `app/(app)/calendar/index.tsx` | Month/Agenda switch, agenda list, back-to-month from a date heading |

## 4. Acceptance criteria
| Criterion | How |
|---|---|
| Events are in chronological order | Date groups in order; tested |
| Same-day order is stable | Deterministic comparator; "keeps same-day order stable" |
| Several events at the same date are supported | Grouped under one heading |
| Overdue is grouped consistently | Overdue section first, including earlier months |
| Empty days are useful, not blank | Empty-state sentences |
| Rows show source, amount and state | Shared event row |
| Tapping an event opens its detail or action | Opens the source; the 181 detail sheet replaces this |
| Week boundaries follow locale and timezone | `startOfWeekDateKey`/`endOfWeekDateKey` with `firstDayOfWeek`; local date keys |
| Long lists stay smooth | FlashList with item types; 5,000-row test |
| Screen readers and dynamic text | Header roles, spoken labels on rows and headings, theme typography |

## 5. Manual testing guide
1. Open **Financial calendar** → **Agenda**. This week's events show under date headings.
2. Switch to **Next 30 days**, then step forward and back; tap **Today**.
3. Leave a card bill unpaid past its due date. It should appear under **! Overdue** at the top.
4. Tap a date heading. You should land on the month view with that day selected.
5. With TalkBack on, the headings, rows and "Next financial event" should all be announced.
