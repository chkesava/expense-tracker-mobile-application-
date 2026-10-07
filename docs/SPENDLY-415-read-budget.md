# SPENDLY-415: Firestore Read Budget & Regression Protection

## Objective

Prevent future releases from silently returning to high Firestore read consumption, by defining numeric budgets from what SPENDLY-407–414 actually measured and bounded, and backing them with automated regression checks. Part of the SPENDLY-406 Firestore Read Optimization epic.

## What this is, and isn't

This is a **documented manual benchmark + static-analysis regression suite**, consistent with how this epic has already been protecting itself (`scripts/verify-performance-budgets.js`, run via `npm run perf:verify` and wired into the Android release pipeline's `release:verify`). It is **not** a live, CI-measured benchmark that launches the app against a seeded emulator and asserts exact read counts automatically — building that would be new test infrastructure (a headless app-launch harness), which is out of scope for this story. If the team wants that automated end-to-end, it's a good candidate for its own follow-up ticket.

## How to run a benchmark session

1. In a dev build (`__DEV__` is true, or set `EXPO_PUBLIC_PERF_MARKS=1`), the app automatically resets Firestore read-attribution stats on cold launch (`app/_layout.tsx`) and exposes them on the global console as `spendlyReadStats()` — no debug screen needed.
2. Run the app against the Firebase emulator with representative seeded data (`docs/LOCAL_TEST_MODE.md` — Spendly Test), or against a real dev account with a known transaction history size.
3. Perform the representative session (see the budget rows below for what counts as "startup," "dashboard session," etc.).
4. In the Metro/Expo dev console (or Chrome/Hermes debugger), call `spendlyReadStats()`. It returns `{ totalServerReads, totalCacheReads, totalListenerAttaches, totalListenerUpdates, totalDirectGetDocs, collectionStats: { <collection>: { serverReads, cacheReads, attaches, updates, directGets } } }`.
5. Compare `totalServerReads` (and the per-collection breakdown) against the budget below.
6. Every `[fs-read]` console line printed during the session (from `lib/firestoreReadDebug.ts`) gives a live, per-event trace if you need to find exactly which read pushed a collection over budget — each line is zero-PII (path, doc count, cache/server, feature tag only).

## Budgets

All numbers are **server reads** (cache reads are free and excluded) and assume a single user session, nothing already warm from a previous run in the same process.

### Startup budget (cold launch → dashboard first paint, no optional widgets touched)

| Collection | Expected reads | Source |
|---|---|---|
| `expenses` | ≤300 | Staged page, `LEDGER_STAGED_LIMIT` (SPENDLY-409) |
| `incomes` | ≤300 | Staged page (SPENDLY-409) |
| `accounts` | <20 | Small bounded collection (SPENDLY-407 inventory) |
| `accountTypes` | <15 | Small bounded collection (SPENDLY-407 inventory) |
| `categories` | ≤500 (**measured ~287 on device, SPENDLY-416** — corrected from an earlier, never-measured "<50" estimate) | Bounded `limit(500)` (SPENDLY-412). The default taxonomy (`shared/data/categoryTaxonomy.ts`) seeds ~287 category+subcategory docs via `ensureCategoryHierarchy` on first login, and this is the permanent steady-state size, not a one-time cost. `ensureCategoryHierarchy` also does its own unconditional `getDocs(categories)` on every login (another ~287), before checking whether a taxonomy upsert is actually needed — so the true per-cold-launch cost for `categories` is ~574 docs, not ~50-100. See `docs/SPENDLY-416-qa-rollout.md` Finding F2. |
| `subscriptions` | ≤200 (observed <25) | Bounded `limit(200)` (SPENDLY-412) |
| `categoryBudgets`, `financialGoals` | 0, unless their dashboard widgets are enabled | On-demand gated (SPENDLY-411) |
| `spaces`, `categorizationRules` | 0 | One-shot, deferred past first paint (SPENDLY-412) — first read happens whichever pervasive screen (`ExpenseForm`/`ExpenseList`) mounts first, not necessarily at cold launch |
| `creditCardBills`, `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments` | 0 | On-demand gated (SPENDLY-401), dashboard decoupled (`SubscriptionsWidget` idle-defers) |
| EPF, Investments, SIP collections | 0 | Hook-scoped, never mounted outside their own screens |

**Startup ceiling: ~885 server reads** (expenses 300 + incomes 4-300 + accounts <20 + accountTypes <15 + categories ~574 [realtime attach + `ensureCategoryHierarchy`'s own read] + subscriptions ≤200, measured on device per SPENDLY-416). Corrected from an earlier, never-measured "~650" estimate — the `categories` figure was the main gap (see the row above). Still a large improvement over the pre-epic baseline: the dominant ~24K/day driver (the unlimited idle-upgrade re-reading the full ledger every app open) is eliminated entirely, regardless of this correction.

### Dashboard session budget

Startup budget, plus (only if the user has these widgets enabled — both are in `DEFAULT_DASHBOARD_ORDER`):
- `categoryBudgets` — one read on first widget mount this session (≤?, observed ~50-100 per the original inventory).
- `financialGoals` — one read on first widget mount this session (small, observed <15).

### Feature session budget (opening a secondary screen)

| Feature | Expected reads | Notes |
|---|---|---|
| Credit Cards tab/widget | ~bill count (observed 10-30) | On-demand listener attaches only now (SPENDLY-401) |
| Borrowings / Receivables tab | ~row count per collection (observed 10-50 each) | On-demand (SPENDLY-401) |
| Settings → Rules / Spaces (or first `ExpenseForm`/`ExpenseList` mount) | one read each, if not already warm this session | One-shot (SPENDLY-412) |
| EPF / Investments / SIP screens | profile/plan-sized, small | Hook-scoped |

### Daily active usage target

Using the corrected startup ceiling's typical case (~600-700 reads/launch, dominated by the ~574-doc `categories` cost) and the baseline's own usage assumption (10-15 opens/day): **~6,000-10,000 reads/day typical**, still a material reduction from the pre-epic baseline of **~24,000 reads/day** (`docs/FIRESTORE_READ_INVENTORY.md` §1/§3), though less dramatic than the pre-correction estimate. This is a rough extrapolation for sanity-checking trend direction, not a billing guarantee — actual usage varies with transaction volume and which features a user opens. The remaining largest lever, if further reduction is wanted, is `ensureCategoryHierarchy`'s unconditional `getDocs(categories)` on every login (an optimization opportunity flagged in SPENDLY-416, out of this epic's scope).

## Warning / fail thresholds and investigation procedure

- **Warning**: a measured session exceeds **120%** of its budget row above. Investigate before the next release, but it does not block.
- **Fail (block release)**: a measured session exceeds **150%** of its budget row, or any collection expected to be `0` at that checkpoint shows a nonzero `serverReads`/`directGets` count.
- **Investigation procedure**:
  1. Find the over-budget collection in `spendlyReadStats().collectionStats`.
  2. Cross-reference `docs/FIRESTORE_READ_INVENTORY.md`'s inventory table for which provider owns that collection and its documented mount tier (immediate/deferred/on-demand).
  3. Check whether a recent change moved that provider's listener from deferred/gated back to eager, or removed a `limit(...)` bound — `npm run perf:verify` (see below) should already catch the common cases, but re-check the provider's effect dependencies and gating logic by hand.
  4. If the increase is intentional (a deliberate trade-off, e.g. a new dashboard widget that's worth the extra read), record it here as an approved exception with the reasoning and the new expected number, rather than silently raising the budget.

## Automated regression checks

`scripts/verify-performance-budgets.js` (`npm run perf:verify`, also run by the Android release pipeline via `npm run release:verify`) now checks, in addition to its original 4 startup guardrails:
1. **No duplicate listeners**: no two `providers/*.tsx` files subscribe to the same Firestore collection via `onSnapshot`.
2. **On-demand gating present**: `registerSubscriber`/`registerBorrowingsSubscriber`/`registerReceivablesSubscriber`/`registerBudgetsSubscriber`/`registerGoalsSubscriber` still exist in their respective providers (SPENDLY-401/411) — catches an accidental revert to an always-on listener.
3. **Reference queries stay bounded**: `categories`/`subscriptions`/`spaces`/`categorizationRules` in `ExpenseReferenceDataProvider.tsx` each still have a `limit(...)` near their `collection(...)` call (SPENDLY-412).

These are static source-text checks, not a live read count — they catch the specific regressions this epic already fixed from silently reappearing, not every possible new read-amplification pattern. The manual benchmark above is still the way to validate a release's actual read volume.

## Exceptions log

- **2026-10-07 (SPENDLY-416 QA)**: `categories` budget corrected from an estimated "<50 docs" to a measured ~287 docs (574 total per cold launch, including `ensureCategoryHierarchy`'s own read); startup ceiling corrected from ~650 to ~885. Reasoning: the original figure was never actually measured against the real default taxonomy (`shared/data/categoryTaxonomy.ts`); SPENDLY-416's device QA measured it directly via `[fs-read]` logcat output. Not a regression — a documentation correction. See `docs/SPENDLY-416-qa-rollout.md` Finding F2.
