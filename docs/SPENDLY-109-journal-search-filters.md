# SPENDLY-109 — Advanced Journal search and transaction filtering

**Ticket:** [SPENDLY-109](https://kesavach.atlassian.net/browse/SPENDLY-109) — *Advanced Journal search and transaction filtering* (Task, High)
**Epic:** [SPENDLY-102](https://kesavach.atlassian.net/browse/SPENDLY-102) Ledger Intelligence & Financial Journal
**Integration branch:** `ledger-v2` (PR targets `ledger-v2`, never `main`)
**Baseline:** `ledger-v2` @ `0def7c8`
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Status:** Implemented on `feat/SPENDLY-109-journal-search-filters`. `npm test` (265 files / 3641 tests), `npm run typecheck` and `npm run typecheck:shared` all pass.

---

## 1. Context

The Journal — the `expenses` tab of `app/(app)/ledger.tsx` — is the only screen
that spans every account, but its filtering was the weakest in the app. It had
exactly two controls:

1. the global month pill (`isInMonth` against `useModals().globalMonth`), and
2. a naive lowercase substring match over `note | category | subcategory | tags`
   for expenses and `source | note` for incomes (`ledger.tsx:118-145`).

No date range, no amount range, no transaction-type filter, no account filter,
no way to combine filters, and no reset.

SPENDLY-82/83 had already built a mature, tested filter + search stack for the
per-**account** screen. This ticket brings that capability to the Journal and, as
the ticket requires, reuses `TransactionFilters` and the existing transaction
list rather than growing a second one.

---

## 2. Design

### 2.1 Why not `buildAccountActivities`

`buildAccountActivities` (`shared/utils/accountBalance.ts:360`) is account-scoped
by construction. Fanning it across every account to assemble a global journal
would break the epic's hardest rule twice:

* A transfer between two owned accounts emits an out-leg on the source and an
  in-leg on the destination. Concatenated, **the same movement is counted twice.**
* Rows with no `accountId` — an ordinary cash expense — belong to no account and
  would **vanish from the journal entirely.**

`FilterableAccountActivity` is not coupled to that builder, though; it is a plain
wrapper. So the Journal synthesizes **exactly one activity per `Expense` and one
per `Income`, and nothing else.** No payments, entries, transfers, borrowings,
receivables or cashback rows are derived. Double-counting becomes structurally
impossible rather than something to defend against, and the invariant

```
records.length === activeExpenses.length + activeIncomes.length
```

is directly assertable — `journalActivities.test.ts` does exactly that.
`accountId` never selects a row; it only decorates one.

### 2.2 `accountName` is not `counterparty`

`counterparty` means the *other* side of a movement (a transfer's payee, a
borrowing's lender). Journal rows have no other side, so that field stays empty
and the account a row was posted to lives in a new `accountName` field with its
own `accounts` filter facet. Overloading `counterparties` would have been a
smaller diff but would mislabel a financial field on one of the two screens.

`AccountActivityFilterModal` already hides any section whose options array is
empty, so the account-detail and credit-card screens — which produce no
`accountName` — self-hide the new ACCOUNTS section and are unchanged.

### 2.3 Month pill vs date range

Agreed rule: **the range overrides the month.** `resolveJournalDateScope`
(`shared/utils/journalDateScope.ts`) is a total function:

1. Either `fromDate` or `toDate` set → returned **verbatim**, `monthOverridden`.
   A one-sided range deliberately stays open-ended: clamping "everything since
   Jan 2024" to the selected month would silently mean "Jan 2024, but only in
   September".
2. Else a valid `YYYY-MM` → expanded to the month's first and last day.
3. Else → unscoped, no throw.

Clearing the range makes rule 1 stop firing, so month scope returns on its own.
That is what makes "clearing filters restores the complete view" true by
construction rather than something the screen has to remember.

While a range is in force the pill renders dimmed and suffixed `· overridden`,
and tapping it clears the range instead of opening the month drawer.

### 2.4 The pipeline is a pure function

The acceptance criteria are about *combinations* across the whole pipeline, and
vitest only collects `shared|services|lib|scripts|supabase` — so the pipeline
cannot live in `app/`. `runJournalFilterPipeline`
(`shared/utils/journalFilterPipeline.ts`) owns every step and `ledger.tsx` calls
it from a single `useMemo`, so the code under test is the code that ships.

Step order mirrors `app/(app)/accounts/[id].tsx:407-453`, including the two
decisions that are easy to get backwards:

| # | Step | Why this order |
|---|---|---|
| 1 | `buildJournalRecords` | drops soft-deleted rows; the pipeline must not *rely* on the provider having done so |
| 2 | `getAccountActivityFilterOptions(records)` | from the **unsearched** set, so a search can never leave the sheet with empty pickers |
| 3 | `searchAccountActivities(records, query)` | **before** filters, so chip counts describe rows actually on screen |
| 4 | `resolveJournalDateScope` → `effectiveFilters` | month-or-range injected here, once |
| 5 | `applyAccountActivityFilters(searched, {…, kind:"all"})` | chip counts ignore the kind filter, or selecting "Income" would zero the Expense chip with no way back |
| 6 | `applyAccountActivityFilters(searched, effectiveFilters)` | the rendered set |
| 7 | `journalRecordsToRows` | split for `ExpenseList`, **same object references** |
| 8 | `countActiveAccountActivityFilters(input.filters)` | the **raw** filters — counting the injected month range would claim active filters on a screen the user never filtered |

The advanced sheet's live result count re-resolves the scope **from the draft**,
because the draft's own dates decide whether the month is still in force. Using
the outer scope there would make the count lie the moment a date is typed.

### 2.5 Two pre-existing gaps this ticket had to close

Both are required by "respect staged vs complete ledger state".

**`incomesComplete` did not exist.** Incomes are staged to `LEDGER_STAGED_LIMIT`
(300) exactly like expenses (`FinanceDataProvider.tsx:415`), but only expenses
got a completeness flag in SPENDLY-97 — and the idle upgrade reused the *staged*
callback, so nothing could observe that incomes were still a page. Added
mirroring the expenses path exactly: a `makeApplyIncomesSnap(fromFullQuery)`
factory, `setIncomesComplete(true)` when `fromFullQuery || isStagedPageComplete`,
resets on sign-out and on resubscribe, surfaced as `complete` from `useIncomes()`.

**`ExpenseList`'s Spent / Income / Net card was unguarded.** `ledger.tsx` let
`showMonthSummary` default to `true`, so after this ticket it would have summed
an arbitrarily filtered, possibly truncated set and presented it as the month's
totals. It now renders only when

```tsx
showMonthSummary={ledgerComplete && !hasNarrowedView}
```

— the one case where those totals are actually the month's. Per-day subtotals are
sums of rows visibly on screen and stay honest, so they are unchanged.

### 2.6 Five distinct states

In precedence order, satisfying "loading / incomplete / no-result states are
distinct":

1. **Error** — existing `ErrorState`, unchanged.
2. **Loading** — existing skeletons, condition unchanged.
3. **Incomplete** — `!ledgerComplete && !loading`: a warning banner *above* a
   rendered list. Mirrors the `assessCardAnalyticsCompleteness` precedent.
4. **No results** — empty list while narrowed. When *also* incomplete the copy
   is deliberately not confident: "No matches in the transactions loaded so far
   — the rest of your history is still loading." Offers **Clear filters**.
5. **Genuinely empty** — existing `EmptyState`.

`ledgerComplete` is `incomesComplete` on the income sub-tab and
`expensesComplete && incomesComplete` on history — the income tab must not wait
on expenses it never shows.

### 2.7 Scope boundaries

* Filters and search are wired to the `history` and `income` sub-tabs only.
  `audit` is SPENDLY-112's workspace and `LedgerAuditList` is untouched; `data`
  is unrelated.
* The Transfers chip is hidden on the Journal: it would read zero forever, by
  construction. `TransactionFilters` gained an optional `availableKinds` prop
  (default: all four) and an optional `title` (default: `"Transactions"`), so
  both existing call sites are byte-identical in behaviour.
* **Sorting is out of scope** — the ticket does not ask for it and `ExpenseList`
  sorts internally by `postingSortMs`. `sortField` / `sortOrder` stay dormant in
  `LedgerStateProvider`.
* **Origin filtering is out of scope.** "transaction type/source" was confirmed
  with the reporter to mean the income `source` field, which is searchable via
  the haystack and needs no facet. Filtering by *origin* (SMS-imported,
  statement-imported, subscription-generated, manual) would need a new shared
  facet and is a good follow-up ticket.

### 2.8 Dead state removed

`LedgerStateProvider` declared `selectedCategory`, `selectedAccountId` and
`selectedAccountTypeId` that nothing has ever consumed. Each would now be a
second mechanism competing with `journalFilters`, so they are deleted. The
equally dormant `showFilters` is finally consumed — for the advanced sheet's
visibility — rather than adding new state beside it.

---

## 3. Files

**New**

| File | Purpose |
|---|---|
| `shared/utils/journalActivities.ts` | one record per expense / income; the no-double-count invariant |
| `shared/utils/journalDateScope.ts` | month-vs-range resolution as a total function |
| `shared/utils/journalFilterPipeline.ts` | the whole pipeline, pure and testable |
| + the three colocated `*.test.ts` | 91 new cases |

**Changed**

| File | Change |
|---|---|
| `shared/utils/accountActivityFilters.ts` | `accounts` facet; generic widening; extracted `classifyActivitySpecials` |
| `shared/utils/accountActivitySearch.ts` | generic widening; `accountName` in the haystack; optional precomputed `searchText` |
| `providers/FinanceDataProvider.tsx` | `incomesComplete` (§2.5) |
| `hooks/useIncomes.ts` | expose `complete` |
| `providers/LedgerStateProvider.tsx` | `journalFilters`; consume `showFilters`; drop dead slots |
| `components/accounts/TransactionFilters.tsx` | optional `title` / `availableKinds`; `accounts` active chips |
| `components/accounts/AccountActivityFilterModal.tsx` | ACCOUNTS section, self-hiding |
| `app/(app)/ledger.tsx` | the screen rewrite |

`classifyActivitySpecials` is extracted from three private predicates and now
shared by `enrichAccountActivities` and `buildJournalRecords` — this is what
stops the two screens drifting on "what counts as a bill". A parity test pins it.

---

## 4. Tests

91 new cases across three files; existing suites are the regression net for the
shared-util changes.

* **`journalActivities.test.ts`** (29) — the no-double-count invariant and the
  explicit assertion that no transfer/payment/borrowing/receivable leg can ever
  appear; account-less and orphan-account rows kept and undecorated;
  `displayName` preferred over `name`; `isAudited` true/false/undefined mapping;
  falsy-tag stripping; distinct synthetic ids; classification parity against
  `enrichAccountActivities`; `journalRecordsToRows` preserving order and
  returning the **same object references** (`toBe`) so list memoization and the
  edit handlers keep working; 25 000 rows with haystacks precomputed.
* **`journalDateScope.test.ts`** (18) — leap (`2024-02`→29), non-leap
  (`2023-02`→28), 30- and 31-day months; one-sided ranges staying open-ended
  rather than clamped; clearing restoring month scope; `""`, `2026-13`,
  `2026-00`, `garbage`, `2026` and `undefined` all unscoped without throwing.
* **`journalFilterPipeline.test.ts`** (44) — the acceptance suite. Combinations
  (AND across facets, OR within one); boundaries — `min === amount` and
  `max === amount` inclusive, one rupee either side excluded, month first/last
  day, explicit range inclusive at both ends, and **`minAmount: "0"` counted as
  a real filter** (`"0"` is a truthy string, `0` a falsy number — the classic
  trap); month override and restoration; `activeFilterCount` excluding the
  injected month range; kind counts ignoring the kind filter but respecting
  everything else; validation; no-results with pickers still populated;
  soft-deleted rows never surfacing; 25 000 rows end-to-end.
* One assertion in `accountActivityFilters.test.ts` gained `accounts: []`, which
  documents that account-detail activities produce no account facet.

**Behaviour change, deliberate.** The month pill used `isInMonth`, which prefers
a row's stored `month` over its `date` (`dates.ts:47-66`); the date-range path
uses `activity.date`. A row whose stored `month` disagrees with its `date` now
changes bucket. `date` is authoritative, so this is treated as a bug fix. The
regression-lock test asserts the unfiltered month view still equals the old
`isInMonth` result for consistent data.

**Not covered.** `FinanceDataProvider` is outside the vitest `include`, so
`incomesComplete` is verified by inspection plus symmetry with the
already-tested expenses path (`isStagedPageComplete` has its own tests). Stated
here rather than implied as covered.

---

## 5. Manual verification

Per `AGENTS.md`.

**Commands:** `npx expo start` — hot reload covers all of it. No build, native
step, rules deploy, index change or Netlify deploy is needed; this ticket is
client-side only.

1. Journal → History. The header now reads **Journal**, with a search box, kind
   chips (All / Income / Expense) and a filter icon. The month pill sits below.
2. Search a merchant, a category, an account name and an amount. Each narrows;
   two words narrow further rather than widening.
3. Open the filter sheet. Confirm an **ACCOUNTS** section listing your accounts,
   plus categories, tags, statuses, date range and amount range. The live result
   count updates as you edit the draft, including when you type a date.
4. Set From/To spanning several months → rows outside the month appear, the pill
   dims and reads `· overridden`, and the count line says "custom range". Tap
   the pill → the range clears and exactly the month's rows return.
5. With any filter or search active, confirm the **Spent / Income / Net summary
   card is hidden**, and that it returns when you clear everything.
6. "Clear all" resets filters and the search box and restores the month view.
7. Switch to the Income sub-tab: the kind chips disappear (only incomes there),
   and a kind filter carried from History is dropped rather than stranding you
   on an empty list.
8. Audit and Data sub-tabs are unchanged — no filter bar.
9. On a ledger with **>300 expenses or incomes**, cold-start: a "Still loading
   your full history" banner appears above the list, totals stay hidden, and
   both clear once the idle upgrade lands. Filter to something that matches
   nothing during that window and confirm the empty state says "loaded so far"
   rather than claiming there are no matches.
10. **Regression:** open an account detail screen and a credit card. Filters,
    chips, the advanced sheet and the "this cycle" scope label must behave
    exactly as before, with **no** ACCOUNTS section and the Transfers chip still
    present.
11. Web (`npm run web`) and a small Android screen: the chip row scrolls
    horizontally and nothing overflows.

---

## 6. Ticket hygiene

* SPENDLY-102 → **In Progress** (epic started, `ledger-v2` fast-forwarded to
  latest `main`).
* SPENDLY-109 → **In Progress**; branch `feat/SPENDLY-109-journal-search-filters`.
* PR targets **`ledger-v2`**, with `SPENDLY-109` in the title and the browse URL
  in the body.
* The ticket stays **out of Done**: its code lives only on `ledger-v2` until the
  epic's final merge to `main`.
* Follow-up candidate: filtering by transaction *origin* (SMS / statement /
  subscription / manual), deferred from §2.7.
