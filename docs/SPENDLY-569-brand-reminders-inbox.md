# SPENDLY-569: "Spendly" wordmark and reminders inbox bell

This story is part of epic SPENDLY-531. It is on branch `feature/SPENDLY-569-brand-reminders-inbox`, cut from `feature/SPENDLY-531-premium-redesign` at `992eb137`, which includes SPENDLY-568 and SPENDLY-570. It follows up SPENDLY-566.

## Decisions (product owner, 2026-10-22)
1. The wordmark changes from "Vault" to **"Spendly"**.
2. The bell opens a **reminders inbox** of real items. The unread dot comes from real data, never a placeholder.

## Wordmark
`components/layout/AppBarBrand.tsx` now reads "Spendly". It is the one place the wordmark lives, so `Header` and the dashboard hero both follow. The TEST DATA pill (SPENDLY-175) is unchanged.

## Inbox

### Dues
- **Sources:** calendar reminders, card bills, subscriptions, loan EMIs and money owed to the user.
  - These are the same sources the local calendar notifications plan from (SPENDLY-184), plus card bills.
  - They are built with the existing pure SPENDLY-176 builders (`reminderEvents`, `cardBillEvents`, `subscriptionEvents`, `borrowingEvents`, `receivableEvents`).
- **Which items show** (`dueInboxItems` in `shared/utils/remindersInbox.ts`): open events that are either:
  - overdue, looking back up to `INBOX_LOOKBACK_DAYS` = 30; or
  - due within `INBOX_SOON_DAYS` = 3, which matches calendar priority 2.
- **Order:** overdue first (oldest first), then soonest. Completed, cancelled and recorded events never appear.
- **Row text:** the subtitle is the due label only ("Overdue by 12 days", "Due today", "Due in 2 days"). Calendar subtitles can contain unformatted amounts, so money appears only in the ghost-aware amount column.

### Budgets
- Category budgets at or over the warning line this month (`budgetInboxItems`, over-budget first).
- The figures come from `computeActiveCategoryBudgets`. The subtitle names the amount shown: "Over budget · amount over" or "84% used · amount left".
- The month summary is read only while the inbox is open (SPENDLY-406), so budgets aren't part of the unread dot.

### Where it's computed
- `providers/RemindersInboxProvider.tsx` computes the dues once for the shell. It wraps the app shell in `app/(app)/_layout.tsx`.
- Its sources are the shared providers the dashboard and the notifications already subscribe to. They are attached only after startup idle (`scheduleIdleWork`), so the bell never delays first paint.

### Read state
- Stored **on this device only**, in AsyncStorage under `spendly:remindersInboxSeen:{uid}`, capped at 300 ids.
- **Why device-only:** it avoids a new Firestore collection and rule for what is UI state. The trade-off is that read state doesn't sync across devices.
- An item's id is the calendar event id (source + record + date), so each new occurrence of a recurring due is new.
- Opening the inbox marks the current dues as seen. New dues arriving while it's open are marked as well.

### The bell and the screen
- **Bell** (`components/layout/AppBarActions.tsx`): sits between search and profile, so it appears in `Header`, the dashboard hero and account detail.
  - It shows a red dot while there are unseen dues.
  - Its accessibility label is "Reminders, N new" or "Reminders".
- **Screen** (`app/(app)/inbox.tsx`, route `/inbox`): "Due" and "Budgets" sections. Each row opens the record it came from (the event's `href`, or money settings for budgets).
  - Empty state: "You're all caught up".
- **Route registration:** `app/(app)/_layout.tsx` (Stack.Screen), `SUB_SCREEN_ROUTES` in `shared/config/navigation.ts`, and `RESTORABLE_ROUTES` in `shared/config/routeRestoration.ts`, each with a test.

## Files
| File | Change |
|---|---|
| `shared/utils/remindersInbox.ts` (+ test) | New: dues, budgets, due labels, unread count, seen list |
| `providers/RemindersInboxProvider.tsx` | New: shell-wide inbox and device read state |
| `app/(app)/inbox.tsx` | New: the inbox screen |
| `app/(app)/_layout.tsx` | Provider and Stack.Screen |
| `components/layout/AppBarActions.tsx` | Bell and unread dot |
| `components/layout/AppBarBrand.tsx` | "Spendly" |
| `shared/config/navigation.ts`, `shared/config/routeRestoration.ts` (+ tests) | `/inbox` registered |

## Tests and checks
- `npx vitest run shared/utils/remindersInbox.test.ts`: 8 passed. These cover the due window and order, labels, completed/cancelled/out-of-range exclusion, de-duplication, budget levels and amounts, unread counts, the seen-list cap, and defensive parsing.
- Navigation and route-restoration tests pass with `/inbox` added.
- `npm test`: 398 files, 5,830 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: clean.
- **Web, against the Firebase emulator as the demo user:**
  - The app bar reads **Spendly**, and the bell shows a dot.
  - `/inbox` listed two genuinely overdue card bills ("Overdue by 12 days" and "Overdue by 2 days") and a Food & Groceries budget at 90%.
  - After opening the inbox, the bell's dot cleared.

## Rollout
No Firestore rules, indexes or data changes. Ships with the normal web deploy and Android release.

## Found, not fixed (pre-existing)
The Financial Calendar's card-bill subtitle (`cardBillEvents` in `shared/utils/calendarSources.ts`) reads "Minimum 258.9":
- the number is not formatted as currency;
- it is shown even in ghost mode.

The inbox avoids this by not using calendar subtitles. The calendar screen still has the problem; it deserves a small bug ticket.

## Not done / known limitations
- Read state is per device.
- Budget alerts don't count toward the dot, because they are only read while the inbox is open.
- No remote push (SPENDLY-222).
- No Android device QA yet.
