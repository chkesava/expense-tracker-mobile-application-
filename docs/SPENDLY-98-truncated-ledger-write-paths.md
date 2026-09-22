# SPENDLY-98 — Truncated-ledger write paths

**Ticket:** [SPENDLY-98](https://kesavach.atlassian.net/browse/SPENDLY-98)
**Related:** [SPENDLY-97](https://kesavach.atlassian.net/browse/SPENDLY-97) (same race, auto credit-card bills), SPENDLY-12 (the staged/idle-upgrade pattern)
**Baseline:** `main` @ `d8ea454`

## 1. The race

`FinanceDataProvider` loads expenses in two stages: a staged query
`orderBy("createdAt","desc") limit(LEDGER_STAGED_LIMIT)` (300), then an idle
upgrade to the unlimited query. `expensesLoading` goes `false` on the **staged**
snapshot and never returns to `true`, so for roughly the first 1.2 s of a cold
start `!expensesLoading` is true while `expenses` is a 300-row page.

Ordering is by `createdAt`, not `date`, so this is not "the newest 300 days of
spend" — an expense entered months ago falls off whatever its date.

SPENDLY-97 added the fix mechanism: `expensesComplete` on the expenses context,
surfaced as `complete` from `useExpenses()`, true once the unlimited listener
has delivered or the staged page came back server-confirmed shorter than the cap
(`isStagedPageComplete`, `shared/utils/ledgerSnapshot.ts`).

## 2. Audit — every consumer of `expensesLoading`

| Consumer | Writes? | Verdict |
|---|---|---|
| `hooks/useSmsRecurringSync.ts` | Suggestions + notifications | **Fixed** — §3 |
| `hooks/useCategories.ts` (category rename, category merge) | Firestore expense rows | **Fixed** — §4 |
| `hooks/useGamification.ts` | `users/{uid}/stats/summary` | **Safe, left alone** — §5 |
| `providers/CreditCardBillsProvider.tsx` | `creditCardBills` | Fixed in SPENDLY-97 |
| `providers/SetupProgressProvider.tsx` | none (derives a flag) | Safe — read-only |
| `app/(app)/dashboard.tsx`, `app/(app)/ledger.tsx`, `components/analytics/*` | none | Safe — renderers self-correct when the upgrade lands |
| `hooks/useUnifiedNetWorth.ts` | none | Safe — derived total only |

`app/(ganesh)/reimbursements.tsx` shares the local variable name but reads
`useGaneshExpenses`, a different provider with no staged query. Not affected.

## 3. `useSmsRecurringSync` — the filed bug

`detectRecurringPatterns` needs `SMS_RECURRING_MIN_OCCURRENCES` (3) sightings of
one merchant+amount. A truncated ledger hides the older charges, so a real
subscription drops below the threshold or has its cadence classified from a
partial series.

**Severity is lower than the ticket assumed, and the ticket said to confirm it.**
Two mitigations already existed:

* The hook's `lastKey` includes `expenses.length`, so it re-runs when the
  upgrade lands — unlike SPENDLY-97's `didInitialAutoGenerate` one-shot.
* `mergeRecurringSuggestions` (`services/sms/smsRecurringStore.ts`) replaces a
  stored pattern when the incoming one has more occurrences, so a suggestion
  queued from a short page is corrected by the full pass.

What does **not** self-heal:

* A notification fired on the truncated pass keeps its original cadence text —
  `notifyQueued` only fires for newly `added` keys, and the key is
  `merchant|amount`, which does not include cadence.
* Accepting a suggestion inside the ~1.2 s window creates a subscription with a
  frequency inferred from partial history.
* Every cold start does the whole detection pass twice, including the remote
  dismissal read in `mergeDismissedMerchants`.

Fix: gate on `complete` instead of `!loading`.

## 4. `useCategories` — found during this audit, worse than the filed bug

Renaming a category with `rewriteExpenses`, and merging two categories, both
take a shortcut:

```ts
const rows = !expensesLoading
  ? expenses.map(...)                       // in-memory
  : (await getDocs(collection(db, ...))).docs.map(...);   // full read
```

On the staged page that rewrote **300 rows and silently left every older expense
on the old category name.** Unlike every other case here this is a one-shot user
action with no later pass to repair it, so the inconsistency is permanent.

Fix: the shortcut is only valid when the in-memory ledger is the whole history,
so the condition becomes `expensesComplete`. The `getDocs` fallback was already
written and is simply used more often now.

## 5. `useGamification` — safe by construction, deliberately unchanged

It writes `currentStreak`, `longestStreak` and `badges` derived from `expenses`,
gated on `!expensesLoading`. Left as is because nothing wrong can stick:

* `longestStreak` is `Math.max(stored, base, computed, currentStreak)`
  (`shared/utils/expenseStreak.ts`), so a short page can never lower it.
* `currentStreak` recomputes and rewrites when the upgrade changes `expenses`.
* `withStreakBadge` only ever adds `STREAK_7`; badges are never removed.

Gating it would delay the streak on first paint for no integrity gain.

## 6. Tests

`services/sms/smsRecurringDetector.test.ts`, `describe("truncated ledger
degrades detection (SPENDLY-98)")` — builds a Netflix charge on the 5th of six
consecutive months buried in everyday spend, then slices the real 300 by date
descending:

* full history → 6 occurrences, monthly;
* ~60 expenses/month → pattern survives with fewer occurrences and different dates;
* ~150 expenses/month → 300 rows is barely two months, below the minimum
  occurrence count, so the subscription disappears entirely.

The middle case is the honest one: truncation usually **degrades** detection
rather than destroying it. Only a heavy ledger loses the subscription outright.
