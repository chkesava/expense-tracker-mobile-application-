# SPENDLY-695: Dues as push (borrowings, money owed, subscriptions, EMIs)

**Ticket:** [SPENDLY-695](https://kesavach.atlassian.net/browse/SPENDLY-695) (Story)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-695-dues-push`, cut from the epic branch after the 694 merge.

## What it does

A dues source for the reminder engine (692) covers loans to repay, money owed to the user, subscriptions and EMIs. It uses **the same event builders (`calendarSources`) and planner** as the on-device calendar dues, through the shared `calendarPush` helper from 694, so push and local agree.

| Case | Behaviour |
|---|---|
| **Switch** | Only when "Loans, money owed and recurring payments" is on. It stays **off by default**, as today. Lead days are 0, 1 or 3. |
| **Borrowing** | "Repayment due tomorrow / today", then once "Repayment was due yesterday". **Stops at FULLY_SETTLED or CLOSED** (a manual close wins). |
| **Money owed to you** | "Expected today", then once "Expected yesterday". **Stops at FULLY_SETTLED or CANCELLED.** |
| **Part repaid** | Keeps reminding. The outstanding amount is shown only with "Show amounts on the lock screen". |
| **Subscription or EMI** | Future renewals only, with no overdue notice (they're posted automatically). |
| Inactive, completed, finished EMI term, transfers | Never notify |
| **Already posted** | No "due today" once the renewal was posted: the `lastProcessed` month, or `lastProcessedDate` for every-N-days (plan bug 6) |
| **Settled, posted or deleted at the last moment** | The engine re-reads the item at send time, so no push |
| **Edited due date** | Re-planned from the re-read item. Slot ids carry the occurrence date. |
| 3+ due together | One summary: "3 payments due soon" |
| Tap | The calendar day with the item (allow-listed by 230) |

**Reads** (Spark budget):
- borrowings and receivables due from yesterday to 3 days ahead (range on `dueDate`);
- active subscriptions;
- at send time, the item itself.

## Files

| File | |
|---|---|
| `shared/utils/push/sources/duesSource.ts` | The source (candidates, reload, summary) and `subscriptionOccurrencePosted` |
| `scripts/push-reminders.ts` | The dues source joins `buildSources` |
| `firestore.indexes.json` | Collection-group overrides for `borrowings.dueDate`, `receivables.dueDate` and `subscriptions.isActive` |

## Tests

`shared/utils/push/sources/duesSource.test.ts`:
- borrowing due today and the day before;
- settled, closed and cancelled stop;
- part repaid, with and without amounts;
- receivable expected and the day after;
- subscription renewing and already posted;
- inactive, completed, transfer, finished EMI and active EMI;
- switch off;
- posted check for monthly and every-N-days;
- candidates under `users/` only;
- **end to end: settled or posted between query and send means no push, while the receivable is sent**.

## Go-live

The three indexes deploy with checklist step B2. Nothing else is new.
