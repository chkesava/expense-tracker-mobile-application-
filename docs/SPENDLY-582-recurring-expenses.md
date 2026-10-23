# SPENDLY-582: Recurring expenses — overview, schedule detail and management

This story is part of epic SPENDLY-581.
- **Branch:** `feature/SPENDLY-582-recurring-expenses`.
- **Cut from:** the epic branch at `978e9803`, in the worktree `C:\dev\worktrees\spendly-581`.

## Reference image
- **`spendly-recurring-expenses.png`** (Dashboard entry → Recurring Expenses → Netflix detail → Edit) is correct for this story and was inspected.
- Its Netflix, Rent and Spotify amounts, logos, dates and history are illustrative and not reproduced.

## The existing recurring model (inspected, reused, not duplicated)
- **Definitions** are the `subscriptions` collection (`Subscription`):
  - **type:** subscription, EMI or transfer;
  - **cadence:** monthly on `dayOfMonth`, or every N days;
  - **dates:** `startMonth`, EMI `endMonth` / `endYear`;
  - **state:** `isActive`, `isCompleted`, `lastProcessed` / `lastProcessedDate`;
  - **accounts:** `accountId` / `toAccountId`;
  - **source:** `source` (`sms` items are tracked, never posted).
- **Money appears only when the idle auto-poster posts a due date** (`planDueSubscriptionPosts` / `duePost`). It posts as an expense, or a transfer for a recurring transfer, at an idempotent `{subscriptionId}_{month}` id stamped with `subscriptionId`. A scheduled date is never a ledger row until then.
- **Existing flows:**
  - `useSubscriptions` covers add, update, delete and `toggleActive` (pause/resume).
  - `EditSubscriptionModal` is the validated add/edit form (`validateSubscriptionInput`). It handles start month, end date for EMIs, account and destination account.
  - `SubscriptionsList` is the full overview in the Money tab: monthly commitment hero, due strip, Active / Overdue / Paused / Completed, pause/resume, add, and recurring suggestions.
  - `SubscriptionsWidget` is the dashboard's recurring card.

## Changes
- **`/recurring`:** the dashboard entry to Recurring Expenses. It renders the existing `SubscriptionsList` in a page, the same component as the Money tab, not a second list.
- **`/recurring/[id]` — new detail page:**
  - **Header:** icon, name, category and type, status (Active / Paused / Overdue / Completed), amount and cadence. It also shows **Next payment** (from `getNextRenewalDate`) and **Last posted** (from history).
  - **Actions:**
    - **Edit:** opens `EditSubscriptionModal`.
    - **Pause / Resume:** `toggleActive`.
    - **Delete:** a confirmation that explains that charges already recorded stay. Then `deleteSubscription`.
  - **Schedule:** frequency, start, end, and the **next 5 payments** (`upcomingPaymentDates`). It is labelled "Scheduled dates are not spending until they post".
  - **Payment details:**
    - account (and destination account for a transfer), each linking to the account page;
    - **Posting**, derived from what the auto-poster will actually do (`autoPostState`): posts automatically / needs an account / tracked only (SMS) / paused / completed. There is no stored "auto-pay" flag, so none is shown.
  - **History:** only ledger rows carrying this item's `subscriptionId` (expenses, or transfers for a transfer), newest first. Nothing is matched by name or amount. Each row opens `/transactions/[id]`.
- **List rows** in `SubscriptionsList` (Money tab and `/recurring`) now open the detail instead of the edit form. Edit is one tap away there.
- **Dashboard `SubscriptionsWidget`:** "Manage" opens `/recurring`, and a subscription row opens its detail. Card-bill and borrowing rows keep their previous behaviour.
- **Routes:** `recurring/index` and `recurring/[id]` are registered in `_layout.tsx`, `SUB_SCREEN_*` and `RESTORABLE_ROUTES`, with tests.

## Not exposed (no domain support)
- **Skip:** there is no skip rule in the model or the auto-poster. Advancing `lastProcessed` by hand would be a new business rule, so Skip is left out.
- **Mark as paid:** posting is the auto-poster's job, done idempotently by id. A manual "paid" would risk a second charge.
- **Notes and custom icons:** not fields on `Subscription`.

## Correctness
- Upcoming dates are projections only. The first one is the app's own `getNextRenewalDate`, which respects `lastProcessed` and `startMonth`. A test confirms the auto-poster is not due before that date and is due on it. EMIs stop at their last month; paused and completed items project nothing.
- No ledger rows are created by these screens. Balances, card bills and dashboard summaries are untouched.
- **Reads:**
  - subscriptions come from the shared reference-data subscription;
  - history loads the last 6 months through the existing `loadMonth` (bounded, skipped when loaded);
  - transfers are already in the store.
  - No new listeners or indexes.

## Validation (2026-10-23, worktree)
- `npx vitest run shared/utils/recurringDetail.test.ts`: 11 passed. It covers monthly and every-N-days projection, short months, start month, EMI end, paused and completed items, agreement with the auto-poster, linked-only history (expense and transfer), and posting states.
- `npm test`: 443 files, 6219 tests passed.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx expo export --platform web`: succeeded, and the bundle has `recurring/[id]`.
- Not run: lint (no ESLint config), Android build, screenshots.
