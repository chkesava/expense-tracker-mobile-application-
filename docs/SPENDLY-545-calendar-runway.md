# SPENDLY-545: Phase 5a, Planning: Calendar and Runway

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md). Branch: `feature/SPENDLY-545-calendar-runway`.

This story covers:
- the financial calendar: `app/(app)/calendar/index.tsx` (month and agenda views), `CalendarCashSummaryCard`, `CalendarEventRow` and `CalendarMonthGrid`;
- runway: `app/(app)/runway/index.tsx`, `runway/sources.tsx` and `RunwaySourceRow`.

It is UI only. The calendar query, agenda, cash summary, runway engine, runway sources and every write path (reminders, runway settings, runway overrides) are unchanged. `ReminderEditorSheet` and `RunwaySettingsSheet` are Phase 6.

## Changes
- **Calendar.**
  - The cash summary is a `Section`. Its lines are `DataRow`s; a line with no events is not tappable. The window picker uses outline `Chip` tabs instead of the settings `ChipRow`.
  - A negative "Projected remaining" figure sits on a red wash as well as in red text.
  - The month navigation, grid and legend share one `Section`.
  - "Overdue from earlier" is a `Section` with a Show/Hide action.
  - The selected day is a `Section`: the date is the title, the day's totals are the subtitle, and a "Today" pill marks today.
  - Event rows use the shared `RowGlyph`. Money in is shown in the success colour with a "+", and overdue items are red with a warning glyph. Tabular figures are used throughout.
  - Money in on the grid (the ring) uses the success colour, matching the rows.
  - Loading states use `DashboardSkeleton`.
- **Runway.**
  - The headline is the screen's one hero (`HeroSection variant="deep"`). It holds:
    - the estimate badge as a `Pill` (red when below reserve);
    - the confidence level;
    - the headline and its detail;
    - the mode.
  - The figures are a "What it's based on" `Section` of `DataRow`s. "Next N months" moved into the row meta so labels don't truncate.
  - The month-by-month timeline, the biggest drivers, the unusual one-offs and "How this is worked out" are each a `Section`.
- **Runway sources.** The counted total is a `Section` with a ghost-aware `FinancialAmount`. The Counted, Not counted and You owe groups are each a `Section`, with dividers between rows.
- **Switch thumb.** The source switch's `#FFFFFF` thumb now uses theme tokens. On web it also sets `activeThumbColor`; without it, react-native-web drew the thumb teal when on.

## Bugs fixed
- **Calendar and runway ignored ghost mode.** Both screens formatted money with local `formatAmount` helpers, so every amount showed in ghost mode. That included the rows, the day totals, the summary, the event and line sheets, the timeline, the drivers, the reserve in the headline, the sources and their accessibility labels.
  - They now use `useGhostMoney`, and the formatter is passed to every child.
  - Signed figures keep their "+" or "−" when masked.
- **Console errors on Runway sources (web).** The lock icon passed `accessibilityElementsHidden` and `importantForAccessibility` straight to the `<svg>`, which logged two React unknown-prop errors per load. Those props now sit on a wrapping `View`.

## Not done
- **Long titles at 320 dp.** Some row titles still truncate ("Expected money in", "Lowest projected balance", long event names), because `DataRow` keeps titles to one line. The figure and its accessibility label are complete.
- **Negative amounts and the agenda header** behave as before:
  - negative amounts still format as "₹-53,621" (the shared `formatAmount`);
  - the agenda's range title still wraps beside the Today button.
- **Dates stay as readable labels.** The calendar ("Saturday, 17 October 2026") and runway ("20 Oct 2026") already show labels rather than ISO dates, so they were not switched to the user's date-format setting.
- Android and iOS have not been built.

## Validation
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npx vitest run` passed 5,555.
- **Web, local test mode** (seeded emulator; demo card bills, subscriptions and incomes):
  - **Midnight Emerald 390 dp, Light 390 dp, Midnight Emerald 320 dp.** These views had 0 console errors, down from 2 on Runway sources: calendar month, agenda (this week and next 30 days), runway with the methodology open, and runway sources. On all of them `scrollWidth` equals the viewport width, and no raw ISO dates appear.
  - **Ghost mode:** 0 visible ₹ amounts on the calendar month and agenda views and on runway and its sources. Hidden counts were 30, 24, 42, 222 and 42. Before this change, plain `formatAmount` meant none of them were masked.
