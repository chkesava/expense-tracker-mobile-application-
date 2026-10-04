# SPENDLY-178: Financial Calendar aggregation and query layer

**Ticket:** [SPENDLY-178](https://kesavach.atlassian.net/browse/SPENDLY-178) (Story)
**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176). See the [epic record](SPENDLY-176-financial-calendar.md).
**Branch:** `feature/SPENDLY-178-calendar-query`, cut from the epic branch after 177 and merged back with approval.
**Scope:** query logic and a data hook. There is no UI (179/180), no writes and no rules change.

---

## 1. What it does
`queryCalendar({ range, today, currency, data, status?, includeCancelled? })` in `shared/utils/calendarQuery.ts`:
1. **Normalises the range:** valid date keys, ordered, at most **400 days**.
2. **Runs every 177 adapter,** plus `extraEvents` from other features. These are reminders (183) and, later, fee, decision and runway sources. They are clipped to the range.
3. **Removes duplicates by the stable event id,** and counts how many were dropped for QA.
4. **Applies the visibility rules** (§2).
5. **Sorts deterministically:** date → time (untimed first) → priority (overdue first) → direction (out, in, neutral) → source → title → id.
6. **Returns** `events`, `byDate` (a map of display-ordered groups), `earlierOverdue`, `loadState`, `failedSources`, `loadingSources` and `duplicatesDropped`.

`monthGridRange(month, firstDayOfWeek)` returns the whole-week range a month grid shows (used by 179). It reuses the app's `startOfWeekDateKey` / `endOfWeekDateKey`, so the week start follows the user's `firstDayOfWeek` setting.

## 2. Visibility rules
| Event | Rule |
|---|---|
| Cancelled | Hidden unless `includeCancelled` |
| Completed | Shown on its date, so history stays understandable |
| Overdue in range | Shown, priority 3 |
| Overdue before range | Returned in `earlierOverdue` (12-month look-back), so a past unpaid bill is never lost when browsing a later month |
| No source data | Nothing is fabricated: an empty range is an empty list |

## 3. Load states
Each source reports `ready`, `loading` or `error`.

| `loadState` | When |
|---|---|
| `ready` | Every source is ready |
| `loading` | Every source is loading, or some are and nothing has arrived yet |
| `partial` | Some events are shown, but at least one source is still loading or failed (`failedSources` says which) |
| `error` | Every source failed |

**Income:** while older income is still paging in (SPENDLY-109 staged ledger), income is reported as loading, so past months read as partial rather than empty.

## 4. Firebase reads
`useFinancialCalendar(range)` (`hooks/useFinancialCalendar.ts`):
- Reads bills, subscriptions, borrowings, receivables, income, accounts and investments from the providers that already hold them, so a month query does **not** re-read history.
- Listeners added only while a calendar screen is mounted:
  - **SIP plans:** `hooks/useSipPlans.ts`, a single read-only listener. It avoids `useSips`, which also streams transactions, positions and notifications.
  - **EPF contributions and establishments.**
  - **Goals.**
- Nothing is written.

## 5. Acceptance criteria → tests (`calendarQuery.test.ts`, 11)
| Criterion | Test |
|---|---|
| A date-range query returns normalised events | All tests; "normalises reversed, invalid and overlong ranges" |
| Events from different sources can share a date | "lets events from different sources share a date…" |
| Duplicate source records don't create duplicate events | "drops duplicate source records" |
| No fabricated future events | "does not fabricate future events…" |
| Cancelled and completed follow the rules | "hides cancelled… keeps completed" |
| Overdue stays discoverable | "keeps overdue items from before the range discoverable" |
| A month doesn't need the whole history | In-memory providers (§4); performance test (20,000 incomes, 2,000 bills, 200 recurring items, well within budget) |
| Loading, empty, partial and error states | "reports ready, loading, partial and error" |
| Overlaps, duplicate ids and month boundaries | Covered above, plus whole-week grids across leap February and year end, and month-end events |
| Financial writes untouched | Pure function and read-only hooks |
