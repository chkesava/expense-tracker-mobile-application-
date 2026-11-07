# SPENDLY-229: Push for SIP runs and EPF updates

**Ticket:** [SPENDLY-229](https://kesavach.atlassian.net/browse/SPENDLY-229) (Story; rescoped on 2026-11-06 to SIP and EPF only)
**Epic:** [SPENDLY-222](https://kesavach.atlassian.net/browse/SPENDLY-222). See the [epic tracker](SPENDLY-222-push-notifications.md) and the [go-live checklist](SPENDLY-222-go-live-checklist.md).
**Branch:** `feature/SPENDLY-229-sip-epf-push`, cut from the epic branch after the 693 merge.

## How events work (`shared/utils/push/events.ts`)

Reminders are about dates; **events** are about things that happened. The project is on Spark, so there are no Firestore triggers. Instead, the push job polls each event source **once an hour** with a **one-day lookback**:

| Rule | How |
|---|---|
| **Once per event** | Idempotency key `{uid}:{eventKey}`, claimed by the sender (227). The overlapping lookback never sends twice. |
| **Inbox row matches every push** | A source either already has a row (SIP), or the pass creates one as soon as the event is found, with `create`. That never resets a row the user already read. Rows are noted for the read model, since `notifications` is synced (230). |
| **Delivery window** | Outside the user's window the push waits; the next hourly pass inside it (within the lookback) sends it. The row is already in the inbox. |
| **Preferences** | "SIP and EPF updates" (226) is applied by the sender. An opted-out user gets the inbox row but no push. |
| **TTL** | One day |
| **Counting** | A push counts as **sent** only if a message went out. Opted out or no device counts as `no-delivery`. The reminder engine now counts the same way. |

## SIP

`executeSips` already writes an inbox row for each **executed, failed or skipped** run (`notifications`, type `sip_*`, deterministic id). The SIP source pushes each new row once, using the **row's own wording**, so push and inbox are identical.
- **Paused or cancelled plans** never run, so they produce no row and no push.
- **Tap:** opens Investments.

## EPF (`epfContributions`)

| Event | When | Stops |
|---|---|---|
| **Contribution expected** | The monthly EPF cron releases a month to `expected` (`statusUpdatedAt` in the lookback) | It's the same release, sent once |
| **Not credited yet** | Once, after `expectedCreditTo` has passed (the window ended in the last 3 days) with status still `expected` | Never once credited, missed or reversed |

- **Copy:** "Your EPF for October 2026 should be credited by 15 Nov." No amounts.
- **Tap:** opens `/epf/{establishmentId}`.
- **Inbox rows:** ids `epf_expected_{id}` and `epf_late_{id}`.

**Reads** (Spark budget), hourly:
- SIP rows created in the last day;
- EPF rows whose status changed in the last day, or whose credit window ended in the last 3 days.

## Files

| File | |
|---|---|
| `shared/utils/push/events.ts` | `EventSource`, `runEventTick` (rows, window, send, counting). Shared by 697 and 698. |
| `shared/utils/push/sources/sipEpfEvents.ts` | `createSipEventSource`, `createEpfEventSource`, `monthLabel` |
| `scripts/lib/pushRunCore.ts` | The hourly event pass (`isEventPass`: the first quarter of each UTC hour); the run summary gains `events` |
| `scripts/push-reminders.ts` | `buildEventSources` (SIP, EPF) |
| `shared/utils/push/reminderEngine.ts` | `sent` counts only real deliveries |
| `shared/utils/push/testing/fakeAdminDb.ts` | Compares timestamps numerically |
| `firestore.indexes.json` | Collection-group overrides `epfContributions.statusUpdatedAt` and `epfContributions.expectedCreditTo` (the SIP poll uses the existing `notifications.createdAt` override) |

## Tests

- `shared/utils/push/sources/sipEpfEvents.test.ts`:
  - SIP rows pushed once with their own wording, old rows ignored;
  - EPF expected push plus inbox row, never resent, and a read row is never reset;
  - not-credited-yet once, never once credited, missed or reversed;
  - windows ended too long ago, or not yet ended, are ignored;
  - outside the window the row is written now and the push goes the next morning;
  - opted out gets the row and no push;
  - `users/` paths only.
- `scripts/pushRunCore.test.ts`: the event pass runs in the first quarter of the hour only.

## Go-live

The two EPF indexes deploy with checklist step B2. Nothing else is new.
