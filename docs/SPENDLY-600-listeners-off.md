# SPENDLY-600: no Firestore listener in supabase mode, and how the savings are measured

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-600-listeners-off` |
| Migration | none |

Switching a collection to `supabase` saves reads only if no Firestore listener on it is still mounted.

## Built

- **Every consumer gated.** Each listener on a collection that reads through the switch now sits behind its `supabase` branch. Before this story, two were still mounted in supabase mode:
  - `useSipPlans` (the calendar) listened to `sipPlans`. It now follows `readModel.sipPlans`, like `useSips` (598).
  - The drill-downs' month store (`lib/summaryMonthStore.ts`) kept a Firestore listener per month on `financialSummaries/dashboard_*`. It now has a twin over the copy, `copySummaryMonthStore`, and `useSpendingSummaries` picks one by `readModel.financialSummaries`. If the copy fails, a month falls back to its Firestore listener.
- **Shared providers:**
  - `FinanceDataProvider`'s `expenses`/`incomes` window (596) and the account ledger (597) are one listener each, already gated. Their roughly 10 consumers read the provider, so turning the collection to supabase removes the listener for all of them.
  - One-off `getDocs` reads (pagination, a writer's Firestore verification) aren't listeners. They stay by design and are counted by the 588 meter.
- **The fallback:** a copy failure falls back to Firestore for the session (673), and the month store falls back per month. No screen loses data.

## Proof: `lib/readModelLocal/listenersOff.test.ts`

The test scans every `onSnapshot` in the app.
- **How it finds collections:** it follows `const q = query(collection(...))` variables, `*_COLLECTION` constants, nested `watchlists/{id}/items` and the categories revision document.
- **The rule:** every listener on a migrated collection must sit behind its source's `mode === "supabase"` branch in the same effect, or be listed in `KEEP` with its reason.
- **What is in `KEEP`:**
  - `useEpfEstablishment`'s single document: the detail screen's writers read it (598, R4.3a).
  - `summaryMonthStore`'s Firestore listener: firestore mode, and the copy store's fallback.
- **Self-checks:** the test checks the scan finds the known listeners (expenses, incomes, accounts, holdings, investments, categories, summaries, SIP plans, reminders, EPF, watchlist items), and that every `KEEP` entry still exists.
- **Mutation check:** removing the gate from `useSipPlans` makes it fail with `hooks/useSipPlans.ts: sipPlans`.

## Still listening on Firestore, by design (not migrated by this epic)

- **Collections that drive writes (R4.3a):**
  - EPF transfers, reconciliations, wage history and profile;
  - the users/{uid} settings document (PIN, duress and lock fields).
- **Collections no story migrated:**
  - `decisions`, `feeReviews`, `feeSignalDismissals`, `goalFundingPlans`, `runwayOverrides`, `runwaySettings` and `whatIfScenarios`;
  - `portfolioOrders`, `alerts`, `portfolioSnapshots`, notifications, gamification stats;
  - `system_settings/global` (the switches themselves).

  Each is a small, screen-scoped listener. They're candidates for a follow-up if the measurement shows they matter.

## Measuring (after the epic reaches main; the checklist, step 10)

Measure one step at a time. A step is one flip of `readModel.<collection>` to `supabase`, after its shadow.

1. **Baseline:** the 7-day Firebase console reads per day before the step, plus a 588-meter lab launch (cold launch, relaunch, each screen).
2. **Flip:** the step's collections, with the user's approval.
3. **After:** 7 days of console reads per day, and the same lab run.
4. **Record** both in the epic tracker's "Read savings" table.

The nightly sync is reduced separately: set `READMODEL_NIGHTLY_MODE=safety-net` (672) once the dual write is live.

Suggested order (largest first, from the 588 inventory):
1. `categories` (62% of a cold launch before 660);
2. the Journal window `expenses`/`incomes`;
3. the account ledger;
4. tiles and summaries;
5. portfolio and EPF;
6. the rest.

## Tests and results

- `npx vitest run`: 539 files, 7,663 tests pass.
- `npx tsc --noEmit -p .` passes.
- `npm run test:rules` passes.
- `lib/spendingDrilldownReads.test.ts` is updated for the store choice.
