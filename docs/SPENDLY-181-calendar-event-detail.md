# SPENDLY-181: Financial calendar event details and source actions

**Ticket:** [SPENDLY-181](https://kesavach.atlassian.net/browse/SPENDLY-181) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-181-calendar-event-detail`, cut from the epic branch after 180 and merged back with approval.
**Depends on:** 177. No data model, no rules, no writes.

---

## 1. What users see
Tapping any event, in the month view, the agenda or the overdue sections, opens a **detail sheet**. It shows:
- the title;
- the date, and the time if there is one;
- **Money in**, **Money out** or **Amount** (or "No amount");
- the status in words;
- **From** (the source feature);
- details, when the source has any;
- a plain explanation of what the status means. Examples: "A commitment with a known date. Nothing has been paid or recorded yet." and "Expected on this date, but not certain until it happens."

Below that, **one primary action** that opens the source feature:

| Source | Action (open) | Action (done) | Goes to |
|---|---|---|---|
| Card bill | View and pay bill | View bill | `/credit-card-bills/{id}`, where the bill screen has pay |
| Subscription / EMI | View recurring item / View EMI | — | Recurring tab |
| Borrowing | View loan and record repayment | View loan | That loan's detail (see §2) |
| Receivable | View and record collection | View receivable | That receivable's detail |
| Income | View transaction | — | `/transactions/{id}` |
| Investment | View investment | — | That investment's detail |
| SIP | View SIP plans | — | SIP tab |
| EPF | Open EPF | — | `/epf/{establishmentId}` |
| Goal | Open goals | — | `/settings/money` |
| Reminder | — | — | Edit, complete and delete arrive in 183 |

**Edge cases:**
- **Cancelled events:** the explanation shows, but no actions.
- **Deleted source:** the sheet looks the event up in **live** calendar data every render. If the source record was deleted or changed while the sheet was open, it says "This item is no longer available…" and shows no action.
- **After acting:** completing an action in the source feature (paying a bill, recording a repayment) refreshes the calendar automatically, because the calendar is computed from the same live data.

## 2. Deep links to one record
Borrowings, receivables and investments had no item routes; their details are modals inside the lists. `hooks/useOpenFromRouteParam.ts` reads `?id=` once the list's data has loaded, opens that item's **existing** detail modal, and clears the parameter, so going back doesn't reopen it. It's wired into:
- `components/borrowings/BorrowingsList.tsx` (`/ledger?tab=borrowings&id=`);
- `components/receivables/ReceivablesList.tsx` (`/ledger?tab=receivables&id=`);
- `components/investments/InvestmentsList.tsx` (`/investments?tab=investments&id=`).

An unknown id does nothing, and the list shows as normal.

## 3. Code
| File | What |
|---|---|
| `shared/utils/calendarActions.ts` (+test, 4) | Actions per source and state; status explanations |
| `components/calendar/CalendarEventSheet.tsx` | The detail sheet |
| `hooks/useOpenFromRouteParam.ts` | `?id=` deep links |
| `app/(app)/calendar/index.tsx` | Opens the sheet from every event row |

## 4. Acceptance criteria
| Criterion | How |
|---|---|
| Every supported event has a valid source link | Action test over every source; item-level links for borrowings, receivables and investments |
| Unsupported actions aren't shown | Only one action, and only where the source supports it; none for cancelled events or reminders (yet) |
| Details never create duplicate records | The sheet only navigates; the source feature does the work |
| Completing an action refreshes the calendar | Live data, so the calendar recomputes |
| Deleted or cancelled sources don't leave misleading actions | Live lookup → "no longer available"; cancelled → no actions |
| Permission or security failures are handled | The calendar reads only the owner's data through existing hooks; a failed source is reported as partial (178) |

## 5. Manual testing guide
1. Tap a card bill on the calendar, then **View and pay bill**. Pay it, go back, and check the bill now reads **Done**.
2. Tap a loan with a due date, then **View loan…**. The Borrowings tab should open with **that loan's detail open**.
3. Do the same for a receivable and an FD.
4. Open an event, delete its source in another screen, and come back. The sheet should say it's no longer available.
