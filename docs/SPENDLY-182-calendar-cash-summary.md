# SPENDLY-182: Upcoming commitments and projected cash summary

**Ticket:** [SPENDLY-182](https://kesavach.atlassian.net/browse/SPENDLY-182) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-182-calendar-cash-summary`, cut from the epic branch after 181 and merged back with approval.
**Depends on:** 177 (events) and the runway epic's counted money (207). No data model, no rules, no writes.

---

## 1. What users see
An **Upcoming commitments** card sits at the top of the calendar month view. A chip picks the window: **Next 7 days**, **Next 30 days** (default) or **Rest of this month**.

| Line | Label | Meaning |
|---|---|---|
| Counted money today | **Actual** | The bank, cash and wallet total the user counts (Runway sources, 207). Tapping opens Runway sources |
| Expected money in | **Forecast** | Open *expected* inflows in the window: money owed to you with a due date, FD maturity |
| Upcoming commitments | **Forecast** | Open *scheduled* outflows in the window: card bills, recurring items, EMIs, loan due dates, SIP runs |
| Overdue, still owed | **Forecast** | Open overdue outflows in the window or from the past 12 months. Shown only when there are any |
| Projected remaining | **"FORECAST — NOT A CONFIRMED BALANCE"** | Counted + expected in − commitments − overdue |

**How each figure is shown:**
- **Traceable:** every forecast line shows how many events make it up. Tapping it lists those events, and tapping one opens its detail sheet (181).
- **Notes:**
  - "N upcoming items have no amount and aren't included", when that applies;
  - "Recorded income is already in your counted money. Everyday spending isn't included here."
- **Link:** "Full projection with everyday spending → Financial runway".

## 2. Rules (`shared/utils/calendarSummary.ts`)
- **Not a second engine:** the summary only adds up calendar events from 177/178, re-queried for the window with the same in-memory data (`useFinancialCalendar` now exposes `data` and `status`). The full projection with typical spending stays in Financial Runway.
- **Excluded:**
  - completed and cancelled items;
  - **recorded income**, which is already in the counted balance, so adding it again would double count;
  - neutral events (EPF credits, goal milestones);
  - events in another currency;
  - events with no amount, which are listed separately;
  - anything outside the window.
- **Overdue counted once:** an item counts once even if it appears both in the window and in the earlier overdue list.
- **Known limit:** a subscription charged to a credit card counts as an outflow on its renewal date, although the cash leaves when the card bill is paid. That's conservative, and noted for users through the forecast label.

## 3. Acceptance criteria
| Criterion | How |
|---|---|
| The projection window is visible | Window chips; the range is part of the result |
| Inputs trace back to calendar events | Each bucket keeps its events; tap-through list; tested |
| Actual and projected are kept apart | "Actual" vs "Forecast" tags; the projected total is labelled not a confirmed balance |
| Cancelled and completed commitments are excluded | Tested |
| Forecast is never shown as a balance | Labelling and accessibility text say "forecast, not a confirmed balance" |

## 4. Code
| File | What |
|---|---|
| `shared/utils/calendarSummary.ts` (+test, 6) | Windows, buckets, projection, exclusions |
| `components/calendar/CalendarCashSummaryCard.tsx` | The card |
| `hooks/useFinancialCalendar.ts` | Exposes `data` and `status` for a second range |
| `app/(app)/calendar/index.tsx` | Card, line-events sheet, detail lookup across the summary |

## 5. Manual testing guide
1. With a bill due in 10 days and a loan owed to you due in 20, open the calendar. Check that **Next 7 days** leaves out both and **Next 30 days** includes both.
2. Tap **Upcoming commitments**. The events are listed; tap one to open its detail.
3. Mark the bill paid. It leaves the commitments and the projection rises.
4. With TalkBack on, the projected line should be read as "a forecast and not a confirmed balance".
