# SPENDLY-568: Net-worth history (snapshots, trend chart, period change)

This story is part of epic SPENDLY-531. It is on branch `feature/SPENDLY-568-net-worth-history`, cut from `feature/SPENDLY-531-premium-redesign` at `3fa12c11` (in sync with `main`). It follows up SPENDLY-566, decision 1.

It adds the net-worth trend line and period change that the Visual First mockup shows on the dashboard card. Both come only from stored daily snapshots.
- No ledger, balance or summary logic changed.
- A snapshot is a copy of the `useUnifiedNetWorth` totals on that day.

## Data contract
Path: `users/{uid}/netWorthHistory/{YYYY-MM}`, with one document per month:

| Field | Type | Notes |
|---|---|---|
| `month` | string | Equals the document id, which matches `^\d{4}-(0[1-9]\|1[0-2])$` |
| `points` | map | Keys `"01"`..`"31"`. Each value is `{ netWorth, assets, liabilities, recordedAtMs }`, with amounts bounded to ±1e12. |
| `schemaVersion` | number | Always `1` |
| `createdAtMs` | number | Pinned after creation |
| `updatedAtMs` | number | |

**Why month buckets instead of one document per day:** the 12-month chart costs at most 12 document reads per listener attach, instead of about 365.

**Rules** (`firestore.rules`, `match /netWorthHistory/{month}`):
- Owner only. Kept out of the personal catch-all list.
- `hasOnly`/`hasAll` on both the document and each point.
- **Append-only:**
  - an update may not change or remove an existing day (`changedKeys`/`removedKeys` must be empty);
  - every newly added day is validated (the 31 day keys are spelled out because rules can't loop);
  - `createdAtMs` is pinned;
  - `delete` is denied.
- Replaying an identical point is allowed, so the write is idempotent.
- Account deletion already removes every user subcollection (`listCollections` + `recursiveDelete` in `netlify/functions/delete-account.ts`). Nothing was needed there.

## When a snapshot is recorded
`hooks/useNetWorthSnapshotRecorder.ts` runs only on the dashboard net-worth card. It records today's point **at most once a day** when all of these hold:
- the history has loaded without error, and today isn't in it yet;
- `snapshotBlockers()` (in `shared/utils/netWorthHistory.ts`) is empty. Nothing is recorded:
  - in duress mode;
  - while offline (cached data may be stale);
  - while the core or secondary net-worth sources are loading;
  - while any holding has no live quote, because `composeNetWorth` would price it at its average buy price. This is the new `holdingsMissingQuote` count on `UnifiedNetWorthSummary`.
  - while `liquidBalanceMayBePartial` is set (SPENDLY-413);
  - when any value is non-finite or out of bounds;
- the values stay unchanged for 2.5 s, so a late quote isn't caught mid-update.

The write itself:
- It is a `commitMutations` merge-write of one day key. Today's key comes from `settings.timezone`, the same "today" `useUnifiedNetWorth` uses.
- A late failure is logged (`netWorthHistory.record.late`), not toasted, because the user didn't ask for this write.
- If a valuation never becomes complete on a day, that day simply has no point. Nothing is backfilled or interpolated.

## UI
`components/dashboard/NetWorthTrend.tsx` sits inside the dashboard's `NetWorthHeroCard` through a new `trend` slot. The Money hub's copy of the card is unchanged and reads nothing new.
- **Period chips:** 1M / 3M / 6M / 1Y.
- **Change line:** "Up/Down/No change", then the signed amount in whole rupees, the percentage, and "this month" / "over 3 months" / … The words and an arrow carry the direction as well as the colour.
  - The change is measured from the last recorded day on or before the period start.
  - With shorter history it reads "since {first recorded day}" instead of claiming the full period.
- **Line:** the recorded days are joined, with gaps left as gaps. Long series are thinned evenly to 60 points.
  - This uses the existing `SpendingCurveChart` with two new opt-in props: `tightDomain` (fit the scale to the data rather than to zero) and `dots="ends"`.
  - Its tooltip amount is now `ghostable` everywhere.
- **Empty state:** with fewer than 3 recorded days, the card says "Trend appears after a few days of history." No line is drawn.
- **Load failure:** a one-line message.
- **Ghost mode:** hides the change amount, the percentage and the tooltip. The line's shape stays, but it has no axis values.

## Reads
- One listener: `query(netWorthHistory, where("month", ">=", startMonth))`, bounded to 12 months, so at most 12 documents.
- It is single-field, so no composite index is needed.
- It mounts only with the dashboard net-worth card.

## Files
| File | Change |
|---|---|
| `shared/utils/netWorthHistory.ts` (+ test, + rules contract test) | New: contract, snapshot rule, write builder, flatten, trend/change, downsampling |
| `shared/utils/netWorth.ts` (+ test) | `holdingsMissingQuote()`, which uses the same fallback test as `composeNetWorth` |
| `hooks/useUnifiedNetWorth.ts` | Exposes `holdingsMissingQuote` |
| `services/netWorth/netWorthHistoryStore.ts` | New: `recordNetWorthSnapshot` via `commitMutations` |
| `hooks/useNetWorthHistory.ts`, `hooks/useNetWorthSnapshotRecorder.ts` | New |
| `components/dashboard/NetWorthTrend.tsx`, `components/dashboard/NetWorthWidget.tsx` | Trend UI and wiring (dashboard only) |
| `components/charts/SpendingCurveChart.tsx` | `tightDomain`, `dots`, ghostable tooltip |
| `firestore.rules`, `firestore/netWorthHistory.rules.test.ts` | New validated, append-only rule and its emulator tests |

## Tests and checks
- `npx vitest run shared/utils/netWorthHistory.test.ts`: 17 passed.
- Rules contract test: 5 passed.
- `shared/utils/netWorth.test.ts`: 26 passed.
- `npm test`: 396 files, 5,818 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run test:rules`: 28 files, 555 tests passed, including the 6 new `netWorthHistory` tests.
- **Web, against the Firebase emulator as the demo user (Midnight Emerald):**
  - With no history, the empty state shows. With the seeded holdings, **no snapshot was written**: test mode blocks live quotes, so the `missingQuotes` blocker held, as intended.
  - After removing the holdings in the emulator, today's point was written once (`2026-10/points/22`), in the exact shape the rules allow.
  - With synthetic past days seeded into the emulator only:
    - 1M showed "Up +₹9,745 (+10.8%) this month" with the line;
    - 1Y showed "since 10 Aug 2026";
    - ghost mode hid all amounts and the percentage.

## Rollout (rules first)
This adds a new collection that the client reads and writes, so per `docs/AFTER_MERGE_CHECKLIST.md`, **deploy the Firestore rules before (or with) the web deploy and Android release.**
- Until the rules are live, the history read is denied and the card shows "Couldn't load your net-worth history."
- Snapshot writes fail quietly (logged only).
- A rules deploy is a production change on the shared project and needs explicit approval. It touches no indexes.

## Not done / known limitations
- **No backfill.** History starts the first day a complete valuation is seen after release. A backfill would need its own dry run, variance report and approval.
- **Users who hold stocks get snapshots only on days live quotes load.** If quotes are down, that day has no point.
- **Snapshots are taken only on the dashboard.** A user who never opens it records nothing; there is no scheduled job.
- **Not every source can report a failure.** Loans, card bills, receivables, entries, payments and transfers don't expose a load error to `useUnifiedNetWorth`. If one of their listeners failed while still reporting "loaded", a snapshot could be taken from incomplete data. The other guards make this unlikely, but it isn't impossible.
- **No Android device QA yet.**
