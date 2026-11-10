# SPENDLY-297: Tax deadlines and reminders in the Financial Calendar

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md) §11).

**Branch:** `feature/SPENDLY-297-tax-deadlines`, from the epic branch.

**Invariant:** tax deadlines are a source of the existing Financial Calendar (SPENDLY-176). They are not a second event or reminder system. They are derived from versioned data, never stored, and never duplicated.

## What the user sees

All of this appears only while the tax center is enabled (`taxCenterEnabled`).

- **Calendar:** a new source, "Tax".
  - Advance-tax instalments, the last day of the year, Form 16 due from the employer, and the return dates (due, belated, revised).
  - Each event links to its tax screen: payments, TDS, deductions or the tax center.
  - Events carry no amounts.
- **Reminders inbox (bell):** tax events due within 3 days, or truly overdue.
- **Notifications:** Settings → Financial calendar → **Tax deadlines** (off by default), with 1 day, 3 days or a week before.
  - One notice before and one on the day, plus one the day after for an overdue item.
  - No amounts in the text.
  - They follow the notification window and permission state, through the existing scheduler and its 30-notification cap.
- **User reminders:** reminders the user creates stay `calendarReminders` with category `tax` (SPENDLY-183). Changing or deleting one works as before.

## Deadlines (`shared/features/tax/data/taxDeadlines.ts`)

- **Data only.** Each year is a set with its law, a `version` and its sources. No screen hard-codes a date. A change is a new version.
- **FY 2025-26 (AY 2026-27), `FY2025-26-d1`,** checked on 2026-11-08:
  - Advance tax on 15 Jun, 15 Sep and 15 Dec 2025, and 15 Mar 2026 (s.211).
  - Year end: 31 Mar 2026.
  - Form 16 by 15 Jun 2026 (Rule 31; incometaxindia.gov.in "Form 16 and Form 16A").
  - Return due 31 Jul 2026 (31 Aug for some non-audit cases), belated return by 31 Dec 2026, revised return by 31 Mar 2027 (incometax.gov.in "Income Tax Returns" help).
- **Tax year 2026-27, `TY2026-27-d1`:**
  - Advance tax on the same four dates under the Income-tax Act 2025 (s.408). Published summaries of the Act agree; no official page was found.
  - Year end: 31 Mar 2027.
  - Filing dates are added once an official source confirms them.

## Events (`shared/features/tax/utils/taxCalendar.ts`)

**Id:** `tax:{fy}-{deadlineId}:{date}`. It is stable across rebuilds, so the calendar's de-duplication and the notification ids (`cal:{eventId}:{kind}`) never double up.

**Lifecycle,** from the user's tax records (read only):

| Deadline | Done | Open | Past and not done |
|---|---|---|---|
| Advance tax | An advance-tax payment (SPENDLY-294) dated after the previous instalment and up to this one | Scheduled | Overdue only if the user records advance tax that year; otherwise informational ("No advance tax recorded for this year"), since many people owe none |
| Form 16 (shown only with salary credits that year, or a Form 16 the year before) | A Form 16 entered or uploaded | Scheduled | Overdue |
| Year end, return dates | — | Scheduled | Informational ("This date has passed"). Spendly doesn't know whether a return was filed, so these never nag |

**Offline:** events are recomputed from whatever records are on the device. A payment saved offline completes its instalment immediately, and nothing needs reconciling.

## Reads (READ_MODEL_RULES)

- **`hooks/useTaxCalendarFacts.ts`:** one listener each on `taxEntries` and `taxDocuments`, `where("fy", "in", TAX_DEADLINE_YEARS)` (two years today).
  - Both go through their read switches; `supabase` mode reads the on-device copy with no Firestore listener.
  - Display only; nothing writes from it.
  - Uses the automatic single-field index on `fy`, so no index change is needed.
- **Mounted only with the tax center on,** in three places:
  - the calendar screen;
  - the inbox (after startup idle);
  - the notification sync (only when the Tax deadlines switch is on).
- **No new collection, field, rule or migration.** The two new settings fields live inside the existing `calendarNotifications` map, which the users-doc rules don't validate key by key and the read model stores as a whole.

## Not in this story

- **Server push.** When reminders are delivered by push (SPENDLY-693 "push" mode), the phone's calendar notifications are switched off, and tax deadlines aren't in the server fan-out yet. That's a follow-up (plan §11).
- **Tracking whether a return was filed.**

## Tests

| File | Covers |
|---|---|
| `taxCalendar.test.ts` | Deadline data valid, unique, versioned and sourced, in the right part of the year; FY 2025-26 dates as checked; no unverified 2026-27 filing dates; advance-tax lifecycle (payment in window completes, overdue only for advance-tax payers); Form 16 only with salary, completed by entry or upload; past filing dates informational; both years across a year switch with stable ids and no duplicates; in the calendar query once, only with tax facts; notifications off by default, lead time, no amounts, informational dates never notify |
| `calendarSources.test.ts`, `settings.test.ts` | 14 sources; tax prefs defaults and repair |
