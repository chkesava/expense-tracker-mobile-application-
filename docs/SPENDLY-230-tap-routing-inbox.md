# SPENDLY-230: Open the right screen from any notification, and a unified inbox

**Ticket:** [SPENDLY-230](https://kesavach.atlassian.net/browse/SPENDLY-230) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-230-tap-routing-inbox`, cut from the epic branch after the 231 merge.

## 1. Tap routing

`hooks/useNotificationTapRouting.ts` (SPENDLY-184) is extended rather than replaced. The rules live in `shared/utils/push/notificationRoutes.ts`:

- **Local reminders** (`source`: credit_card_bill, calendar or goal) route as before.
- **Spendly push** (`product: "expense"`, a known category) opens its `url` only if it is a plain in-app path under an allow-listed screen: credit-card-bills, calendar, goals, inbox, investments, epf, vaults, accounts, recurring, settings.
  - No external links, no `//`, no `..`.
  - **Anything else opens the inbox**, with a short message, because the item is listed there.
- **Other products' pushes** (Ganesh, Nutrition) and unknown sources are ignored. The hook is only mounted in the Spendly shell.
- **Cold start, or a tap before sign-in:** the launch tap is read once the Spendly shell mounts, which is after auth. It is never replayed on a remount.
- **Foreground:** one handler (`lib/notificationHandler.ts`) now replaces the two that overrode each other. It shows **no banner when the user is already on that notification's screen**; the notification still goes to the list. The shell reports the current route through `usePathname`.

## 2. Unified inbox

The app-bar bell's screen is now **Inbox**. Alongside **Due** (the computed reminders) and **Budgets**, it has an **Updates** section: the stored rows in `users/{uid}/notifications`.
- **Writers:** SIP execution today. The server events (229, 697, 698) will write one row per push they send.
- **Reading:** the newest 30 rows, through `hooks/useNotificationRows.ts`. **One listener** is shared by the inbox and the SIP sheet (`useSips` now uses it instead of its own unlimited listener).
- **Unread:** the badge counts unseen dues plus **unread rows**.
- **Read state is stored on the row, so it is the same on every device.** Opening the inbox marks rows read, and so does tapping a row.
- **Tap:** a row opens its link (SIP rows open Investments).

## 3. Read model (the user's decision, 2026-11-06: dual-write `notifications`)

- **Mapping:** a `TableSpec` with type, category, title, url, entity_id, read and the timestamps. The body and meta stay in `doc`.
- **Migration** `20261108000000_readmodel_notifications.sql`: the table, RLS owner-only SELECT, and both allowlists, the purge, counts and data quality, all restated from 20261107 (so they include `devices`).
- **Writers:**
  - `executeSips` now stamps `updatedAt` on its rows (R1.2) and already reports writes (`trackedBatch` + `noteDirectWrites`).
  - Mark-read and clear go through `trackedBatch` + `noteDirectWrites`, and mark-read stamps `updatedAt`.
- **Read switch:** `readModel.notifications` is added to `SWITCHED_COLLECTIONS`. In `supabase` mode the inbox reads the on-device copy and **no Firestore listener is mounted**. The provider-switch and listener guards list it.
- **Indexes:** `notifications.createdAt` and `updatedAt` collection-group overrides, for the cross-user sync.
- **Tests and docs updated:** SQL tests, the identity check, the TS lists and counts (2 × 55), and READ_MODEL_RULES (55 tables).

> **Merge note (as for 224):** Group Funds' `20261106000000` restates the same SQL lists. Whichever epic reaches main second must restate them with both sets.

## Tests

- `shared/utils/push/notificationRoutes.test.ts`:
  - local payloads still route;
  - allowed push routes;
  - unsafe or unknown links fall back to the inbox;
  - other products are ignored;
  - the path safety check;
  - banner suppression.
- `shared/utils/notificationRows.test.ts`: SIP and push rows, unsafe links dropped, newest-first cap, unread count, row links, time labels.
- **Guards updated:** provider switch, no-listener-in-supabase-mode, write hooks, mapping, cross-user indexes, sync-core and push-ref lists, verify counts.

## Not covered here

- **UI review:** the user checks on local Expo web with demo data (Inbox → Updates; SIP rows appear there).
- **Server rows:** the server events writing rows is 229, 697 and 698.
- **Computed reminder seen-state** stays per device, as before. Only the stored rows have shared read state.
