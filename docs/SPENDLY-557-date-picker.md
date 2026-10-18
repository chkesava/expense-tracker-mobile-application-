# SPENDLY-557: Date picker for every Expense date field

Epic: [SPENDLY-531](SPENDLY-531-premium-redesign.md), Phase 6. Branch: `feature/SPENDLY-557-date-picker`, cut from `main`.

**Workflow exception:** at the user's request (2026-10-18), this story was merged straight to `main` rather than through the epic branch. The epic branch was then fast-forwarded to `main`, so the Phase 6 form stories build on it.

## Problem
Spendly had no date picker. Every date was typed by hand as `YYYY-MM-DD`: 47 fields in 33 Expense files. That was slow and error-prone on a phone keyboard, and it ignored the user's date-format setting. Some of those fields had no validation at all.

## What was built
- **`shared/utils/datePicker.ts`** (pure, tested): the picker's date maths.
  - It builds the month grid in whole weeks, using the user's first day of week.
  - It applies min/max limits, and opens on the value's month, clamped into range.
  - It provides month navigation limits, the years for the year jump, and screen-reader sentences ("Sunday, 18 October 2026, today, selected", "…, unavailable").
- **`components/common/DateField.tsx`:** the drop-in replacement for the typed `Input`.
  - It shows the date in the user's format (`formatDisplayDate` + `settings.dateFormat`) and opens the picker on tap.
  - It reads and writes the **same `YYYY-MM-DD` string**.
  - Its label, helper and error use the same form-control parts as `ui/Input`, and the box matches `Input`'s 52 dp height, border and radius.
- **`components/common/DatePickerPanel.tsx`:** the calendar, shown **inline** under the field.
  - Prev/next month, with the buttons stopping at the limits.
  - A month-title button that switches to a year → month jump. The year list opens on the current year.
  - Today; Clear, for optional fields; Close.
  - Days outside min/max are greyed out and can't be picked.
  - On web, the arrow keys move the highlight, Enter picks and Escape closes.
  - Theme tokens only, so it works in Midnight Emerald, light and dark. Cells are at least 44 dp.

### Why inline and not a sheet
The first version opened the picker as a second `Modal`. Most date fields already live inside a sheet, and on web a Gluestack modal stacked on another modal doesn't receive taps: the day couldn't be picked in the reminder sheet. An inline panel behaves the same in sheets, on pages and on every platform. It also needs no native date-picker module, so it ships over the air.

## Fields replaced (47)
- **Fields:**
  - `ExpenseForm`;
  - the account modals: add entry, transfer, pay card bill, cashback, edit account (balance-as-of), download statement, reconcile, activity filter;
  - borrowings and receivables (create and detail);
  - credit-card bills (create, mark paid);
  - EPF: credit, contribution edit, reconcile, establishment, transfer;
  - SIP plan, spaces and trips;
  - create investment;
  - portfolio: holding adjustment, stock cash, trading charges;
  - goal top-up, What-If change, reminders;
  - decisions: commitments, outcome, editor;
  - the goal deadline in Settings.
- **Optional fields** get **Clear**, which saves `""` exactly as an empty typed field did.
- **Picker limits** mirror rules the forms already enforce, so the picker never offers a date the form would reject:
  - **No future dates:** the card statement date, EPF reconcile and EPF transfer.
  - **Today or later:** the What-If start.
  - **"Until" on or after the start:** reminders and What-If.
  - **Card bill:** the due date on or after the statement date; the billing period inside it, start on or before end.
  - **EPF:** date left on or after date joined; the credit date in or after its contribution month.
  - **From/To pairs:** "To" on or after "From" (statement, reconcile, activity filter, trading charges, spaces, trips).
- **Every existing validator still runs unchanged.** The copy that told users to type "YYYY-MM-DD" in the toasts and inline errors now says "Pick…".
- **Side-by-side layouts:** pairs of date fields (and the decision amount + date rows) now wrap, so each date field and its calendar get the full width on phones.

## Not done
- **Validator messages.** The shared validators' own messages (for example "Enter the date as YYYY-MM-DD.") are unchanged in `shared/`, so their tests stay intact. A malformed date can no longer reach them from these screens.
- **Ganesh Seva and Nutrition** (8 files with typed dates) are out of scope, and untouched: they don't import `DateField`.
- **Serif labels on web.** Form labels still render serif there; that is SPENDLY-548's fix. `DateField` uses the same label parts, so it will pick up the fix.
- **Hardcoded rupee.** `decisions/edit.tsx` still says "Expected amount, ₹" (a hardcoded currency). It's left for SPENDLY-555 (6h).
- Android and iOS have not been built.

## Validation
- `npx vitest run shared/utils/datePicker.test.ts` passes 11 tests. They cover:
  - Monday/Sunday weeks, a leap February and six-week months;
  - limits across month edges and the clamped opening month;
  - navigation limits and year bounds.
- `npx tsc -p tsconfig.json --noEmit` and `npm run typecheck:shared` are clean; `npx vitest run` passed 5,566 (5,555 before plus 11).
- **Web, local test mode** (seeded emulator), in Midnight Emerald 390 dp, Light 390 dp and Midnight Emerald 320 dp:
  - **Add expense:** opened the picker, moved back and forward a month, picked 5 Oct and saved. The emulator document has `date: "2026-10-05"`, the same string format as before.
  - **Year jump:** went to February 2024; the 29th is there. The keyboard moved 29 Feb to 1 Mar with →, then Enter.
  - **What-If change sheet:** yesterday reads "unavailable" and is disabled.
  - **Reminder sheet**, the picker inside a sheet:
    - days before the start are disabled;
    - picking 23 Oct sets "Until";
    - Clear empties it.
  - 0 app console errors. The only message was the dev-only GO_BACK warning, caused by opening `/add` directly in the test.
  - `scrollWidth` equals the viewport width, including at 320 dp.
