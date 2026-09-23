# SPENDLY-112 — Ledger audit, data-quality and reconciliation center

**Ticket:** [SPENDLY-112](https://kesavach.atlassian.net/browse/SPENDLY-112) — *Ledger audit, data-quality and reconciliation center* (Task)
**Epic:** [SPENDLY-102](https://kesavach.atlassian.net/browse/SPENDLY-102) Ledger Intelligence & Financial Journal
**Integration branch:** `ledger-v2` (PR targets `ledger-v2`, never `main`)
**Baseline:** `ledger-v2` @ `92b9c1d` (SPENDLY-109 + SPENDLY-111 + SPENDLY-110)
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Status:** Implemented on `feat/SPENDLY-112-ledger-audit-data-quality`. `npm test` (272 files / 3829 tests), `npm run typecheck` and `npm run typecheck:shared` all pass.

---

## 1. Context

The Journal can now be searched (SPENDLY-109), totalled (SPENDLY-111) and
inspected row by row with an audit trail and a correction workflow
(SPENDLY-110). It still could not answer the one question an audit workspace
exists for: **is any of this actually wrong?**

The epic's hardest guarantees turn out to be enforced *structurally* or *at
write time*, and then never re-checked against what is stored:

* `journalActivities.ts` states `records.length === activeExpenses.length +
  activeIncomes.length` — the property that makes the Journal's totals
  impossible to double-count — and nothing asserts it at runtime.
* `statementImport.ts` builds a fingerprint precisely so a statement can be
  re-imported without duplicating every line. Nothing ever re-checks that two
  rows did not end up sharing one.
* A row carries `accountId`, `creditCardBillId`, `subscriptionId`, `spaceId`.
  Nothing notices when one of them points at a record that is gone.
* `month` and `date` are written together and never compared again — yet
  `journalPeriodSummary` buckets by `date` while budgets bucket by `month`. A
  disagreement makes two screens report different totals for the same rupee,
  silently, and year-boundary rows are where it actually happens.

This ticket adds read-only diagnostics for exactly that class of problem, in the
`audit` sub-tab that `ledger.tsx` has reserved for it since SPENDLY-109.

---

## 2. Design

### 2.1 The finding shape: EPF's issue, plus the record it is about

Three candidate models already exist in the repo, and the choice matters more
than it looks.

`accountReconciliation.ts` returns a **bucketed partition** — every statement
line lands in exactly one of `matched` / `missingInApp` / `extraInApp` /
`outOfPeriod`. That is right when the buckets partition one input set. Here they
would not: one expense can be flagged by four unrelated checks at once, and the
inputs are heterogeneous. A partition is the wrong algebra.

`statementImport.ts` returns a **discriminated union** with `Extract<>` buckets.
That is right when each variant carries structurally different payload the
caller must destructure differently. Here it would mean thirteen variants the UI
renders identically as chip + message + subject list — thirteen types buying
nothing.

`EpfContributionIssue` / `EpfReconciliationIssue` are the repo's canonical issue
shape — `{ code, severity, message, field? }` — and are exactly right for "a flat
list of things wrong with records". They lack only *which record*, which the
acceptance criteria demand. So: **EPF's shape extended with `subjects`, wrapped
in a report that borrows `accountReconciliation`'s explicit verdict `status` and
`statementImport`'s convenience buckets.** Issue-level flat, report-level
bucketed.

A duplicate is **one finding carrying every member**, not one finding per row:
the problem is the group, and splitting it would make three copies of one charge
read as three separate problems.

**Two fields are deliberately absent: `fix` and `autoFixable`.** That is how a
read-only diagnostic grows a write path six months later. The word "fix" does
not appear in these types, so the UI has nothing to bind a mutating button to.

### 2.2 `checks` carries the clean results too

`LedgerAuditReport.checks` lists every registered check, passing ones included.
That is what lets the healthy state say *"11 checks run across 3,218
transactions"* instead of *"we found nothing"*. To a user whose ledger was
truncated a second ago those are very different claims, and only the first is
evidence.

The same reasoning drives `skipped`. A check whose dataset is not loaded is
reported as **not run**, never as clean — silently omitting it would imply the
ledger had been examined for something it had not.

### 2.3 A registry, not one function

Thirteen checks inlined into one body could not express per-check `skipped`,
could not be unit-tested individually, and would grow unreviewably.
`LEDGER_AUDIT_CHECKS` is a list of `{ id, label, severity, requires, run }`;
`runLedgerAudit` is then a gate, an index pass, and a loop. Adding check
fourteen is one entry and one function.

`buildLedgerAuditContext` builds the active-row arrays, the id sets and the
fingerprint groups **once** and shares them, so each check is O(n) with O(1)
lookups. The one expensive check, `journal_record_count`, builds its records
inside itself rather than in the shared context — it is their only consumer and
building them walks the whole ledger.

### 2.4 The truncation gate lives in the engine, not the screen

The acceptance criterion "never diagnose from incomplete/truncated ledger data"
is the load-bearing one, because `FinanceDataProvider` loads expenses and
incomes in two stages and `expensesLoading` goes false on the **staged 300-row
page**. A check run against that would report orphans and missing rows that do
not exist.

A UI gate would be a promise. A precondition in the pure function is a
guarantee — and it is the only version the test suite can reach, since
`components/**` is outside the vitest include. So `runLedgerAudit` refuses:
without `expensesComplete && incomesComplete && accountsLoaded` it returns
`status: "unavailable"` with no findings and no checks at all.

**The subtle part is that returning "healthy" there would be a lie.** Zero
findings because nothing was checked is not the same claim as zero findings
because everything passed, and a named test pins the difference.

#### The complete-vs-loaded asymmetry, named rather than papered over

`LedgerAuditReadiness` deliberately uses two different words. Expenses and
incomes are queried with `limit(LEDGER_STAGED_LIMIT)` and upgraded after idle,
and their `*Complete` flags reset on every resubscribe — those are **complete**
flags and they gate hard. Accounts, bills, subscriptions and spaces are queried
*without* a limit, so a settled listener genuinely is the whole collection;
there is no staged page and therefore no completeness flag to have. Calling
those **loaded** keeps the difference visible instead of implying a guarantee
they cannot give.

Accounts joins the required set because `orphan_account_ref` would produce
garbage without it, and it is the cheapest collection in the app.

### 2.5 Offline skips the orphan family, and only that

A cold cache can answer a query without an `Account` document that exists on the
server. Concluding "orphaned" from that would manufacture errors against a
perfectly healthy ledger — the worst possible failure for a tool whose value is
entirely trust. So when `isFromCache` is true every `orphan_*` check is skipped
with `skippedReason: "offline_cache"`.

The intra-row checks still run: month-vs-date, amounts, and duplicates within
the expense set need no cross-collection lookup and are exactly as valid
offline. A plane-mode user gets real answers rather than a blank screen, and is
told which questions were not asked.

### 2.6 Dates are checked by round trip, not by parsing

`new Date("2026-02-31")` does not fail — it rolls forward to March 3. A parse
alone would therefore call an impossible day readable, and every screen would
quietly show a date the row does not carry. `isReadableDate` compares the
components back, which catches both the impossible day and an impossible month.

### 2.7 What is deliberately *not* a check

**"Same amount, same date, therefore a duplicate."** `accountReconciliation.ts`
already argues this for statement lines: two identical coffees in one day are
both real. Without a key the system itself guarantees to be unique — an SMS
fingerprint, a statement fingerprint — the signal-to-noise is unacceptable, and
a diagnostic nobody trusts is worse than none. A named test pins the silence.

**Orphan messages say "missing or removed", never "deleted".** The provider
folds both ledger snapshots with `activeOnly: true`, so soft-deleted rows never
reach the app. From this data a reference to a removed record and a reference to
one that never existed are indistinguishable, and "deleted" would be a claim the
ledger cannot support. A test asserts the wording so nobody later "improves" it
into a stronger statement than the evidence allows. [SPENDLY-130](https://kesavach.atlassian.net/browse/SPENDLY-130) makes it
precise.

**Trips and splits** are per-screen subscriptions rather than app-wide
providers, so the Journal does not hold them. Their checks are registered and
always report *not loaded* — an honest "not checked" rather than a silent
omission or a verdict inferred from absent data ([SPENDLY-129](https://kesavach.atlassian.net/browse/SPENDLY-129)).

### 2.8 The fourth state

The acceptance criteria ask for checking / healthy / issue-found. A truncated
ledger is none of them: nothing failed (so not `ErrorState`), nothing was
searched (so not `EmptyState`), and nothing was checked (so certainly not
healthy). `unavailable` gets its own panel, worded like the Journal's existing
"still loading your full history" notice so the two can never contradict each
other on the same screen.

The **checking** state is real rather than decorative: `runLedgerAudit` in a
plain `useMemo` would be synchronous and that state would never render. The
report is computed through `scheduleIdleWork` instead, with `undefined` as the
checking state — which is also what keeps the tab switch smooth on a large
ledger.

### 2.9 Linking a finding to its record without touching `ExpenseList`

`searchAccountActivities` already matches raw document ids (`referenceIds` +
`idMatchesToken`, prefix and hyphen-segment). So **Show in Journal** sets the
query to the row's id, switches to the History sub-tab, and — crucially — sets
the date range to the row's date. Without the range the month pill would hide
any finding outside the selected month, which is most of them; a range overrides
the month by design (`resolveJournalDateScope`).

Opening SPENDLY-110's detail sheet directly is out of scope: `selectedTx` is
local state inside `ExpenseList` with no prop to drive it, and adding one is a
change to the busiest list in the app. [SPENDLY-132](https://kesavach.atlassian.net/browse/SPENDLY-132).

### 2.10 Scroll ownership

`isExpenseListTab` already includes `audit`, which makes `PageShell`
non-scrollable so the inner `FlashList` owns the scroll. That is left exactly as
it was: `LedgerHealthReport` renders its own `FlashList` with the verdict as
`ListHeaderComponent` and the check list as `ListFooterComponent`. One scroll
owner, no nested virtualisation, and neither `isExpenseListTab` nor
`isFilterableTab` needed changing.

### 2.11 Read-only, held in place rather than promised

Four layers, three of them testable:

1. Everything lives in `shared/utils/`, which never imports the database layer.
2. A **source-scan test** reads both modules and asserts no import can reach
   Firestore or `services/`, and that no write primitive is called.
3. A **frozen-input test** deep-freezes every input and runs the full audit.
   Strict-mode ESM throws on a write to a frozen object, so a stray in-place
   `.sort()` fails here rather than in production.
4. The signature has no capability to write: `readonly` arrays in, a fresh
   report out, no callback and no service handle.

No `firestore.rules` change, no index change, no Netlify deploy.

---

## 3. The check catalogue

| Code | Severity | Requires | Rule |
|---|---|---|---|
| `journal_record_count` | error | expenses, incomes | The Journal must build exactly one record per active row. The invariant stated in `journalActivities.ts` and never asserted until now. |
| `invalid_date` | error | expenses, incomes | `date` is not a readable `YYYY-MM-DD` (round trip, §2.6). |
| `invalid_amount` | error | expenses, incomes | Not a finite number, or negative. |
| `duplicate_sms_fingerprint` | error | expenses, incomes | ≥2 active rows share an `smsFingerprint` or `smsExternalRef`. |
| `duplicate_statement_fingerprint` | error | expenses | ≥2 active rows share a `statementImportFingerprint`. |
| `orphan_account_ref` | error | + accounts | `accountId` set and resolving to nothing. An **absent** `accountId` is not an orphan — account-less cash spending is ordinary. |
| `orphan_bill_ref` | error | + bills | `creditCardBillId` resolves to nothing. |
| `month_date_mismatch` | warning | expenses, incomes | `monthKeyOf(row)` disagrees with `date.slice(0,7)`. A missing `month` falls back to the date and is clean. |
| `zero_amount` | warning | expenses, incomes | `roundMoney(amount) === 0`. Kept apart from `invalid_amount` because zero is sometimes deliberate. |
| `orphan_subscription_ref` | warning | + subscriptions | `subscriptionId` resolves to nothing. |
| `orphan_space_ref` | warning | + spaces | `spaceId` resolves to nothing. |
| `orphan_trip_ref` | warning | + trips | Registered; always reports *not loaded* today (§2.7). |
| `orphan_split_ref` | warning | + splits | Registered; always reports *not loaded* today. |

Cross-collection money checks — transfer endpoints, a bill payment also entered
as a manual expense, duplicate cashback, the 80% unbilled gate — were scoped out
of this ticket with the reporter and are [SPENDLY-131](https://kesavach.atlassian.net/browse/SPENDLY-131).

---

## 4. Files

**New**

| File | Purpose |
|---|---|
| `shared/utils/ledgerAudit.ts` | Types, `buildLedgerAuditContext`, `LEDGER_AUDIT_CHECKS`, `runLedgerAudit` |
| `shared/utils/ledgerAuditChecks.ts` | The thirteen check functions |
| `shared/utils/ledgerAudit.test.ts` | 25 cases |
| `shared/utils/ledgerAuditChecks.test.ts` | 46 cases |
| `components/ledger/LedgerHealthReport.tsx` | The report UI — four states, verdict panel, findings, check list |

**Changed**

| File | Change |
|---|---|
| `app/(app)/ledger.tsx` | Checks/Trail segmented control in the `audit` sub-tab; `handleShowInJournal` |

No provider change, no rules change, no new index, and no widening of
`ExpensesTab` — the segment is local screen state.

---

## 5. Tests

71 new cases; the existing suite is the regression net.

* **`ledgerAudit.test.ts`** (25) — the gate in all three directions, including
  incomes truncated while expenses are complete; **an incomplete ledger with a
  real duplicate in it reporting `unavailable` and specifically not `healthy`**;
  a resubscribe taking a healthy report back to unavailable; orphan checks
  skipped offline while row-level checks still run; every check present in
  `checks` even when clean, with `skipped` distinguished from clean; errors
  ordered before warnings and `errors`/`warnings` partitioning `findings`
  exactly; `coverage` counting active rows only; every finding naming its
  records; the read-only trio (import scan, write-primitive scan, frozen
  inputs).
* **`ledgerAuditChecks.test.ts`** (46) — the row-set invariant with its counts;
  an impossible day rejected by round trip; the December-31-filed-under-January
  trap; a missing `month` staying clean via `monthKeyOf`'s fallback; **two rows
  with the same amount and date and no fingerprint not being a duplicate**; a
  duplicate group emitted once with all members even when reachable by both
  fingerprint and reference; an expense and an income matched by a shared
  reference; **an expense with no `accountId` not being an orphan**, and the
  income twin; **the orphan message saying "missing or removed" and not
  "deleted"**; zero-vs-invalid amounts separated, with `roundMoney` rather than
  float identity; every check parameterised against a soft-deleted row to prove
  none of them ever reports one; subject labelling and its fallbacks.

**Not covered.** `LedgerHealthReport` has no render test — `components/` is
outside the vitest `include` repo-wide. That gap is tracked as **SPENDLY-126**,
raised from SPENDLY-111.

---

## 6. Manual verification

**Commands:** `npx expo start` — hot reload covers it. No build, native step,
rules deploy, index change or Netlify deploy; client-side only.

1. **Cold start, immediately.** Journal → **Audit** → **Checks** shows *Checks
   paused*, not a healthy verdict and not an error. After the idle upgrade it
   re-runs and produces a verdict.
2. **Healthy path.** On a clean ledger: the green panel, "N checks run across M
   transactions", and the CHECKS list below with a tick per check. Confirm
   *Transactions pointing at a missing trip* and *…missing split* read **not
   loaded** rather than passing.
3. **Issue path.** In the Firebase console set an expense's `month` to disagree
   with its `date`. The report shows a warning card naming that transaction by
   category, date and amount, and the verdict flips to "1 issue found".
4. **Show in Journal.** Tap the subject row on that finding — History opens with
   the date range set to the row's date and the query set to its id, and the row
   is visible even when it falls outside the selected month pill.
5. **Orphan check.** Point an expense's `accountId` at an id that does not
   exist → one error reading "missing or removed". Clear `accountId` entirely →
   the finding disappears, because account-less cash is valid.
6. **Offline.** Airplane mode, reopen the tab: the orphan checks report
   *offline*, the month/date and duplicate checks still run, and no orphan
   findings are manufactured from the cache.
7. **Read-only.** The report offers no action but navigation. Switch to
   **Trail** and confirm no new events were written by having opened Checks.
8. **Regression.** Trail behaves exactly as before, including SPENDLY-110's
   restore affordance; History/Income search, filtering and period totals are
   untouched.

---

## 7. Follow-ups raised

* **[SPENDLY-128](https://kesavach.atlassian.net/browse/SPENDLY-128)** —
  `app/(app)/credit-card-bills/discrepancies.tsx` is an orphan screen:
  unregistered in `_layout.tsx`, nothing navigates to it, `onBack` is a dead
  no-op, and it clips past two cards. Recommends folding
  `buildSettledStatementDiscrepancyReport` into this center behind an explicit
  "Run statement checks" affordance — it needs a per-card `CreditCardLedger`, an
  order of magnitude costlier than every check here — then deleting the screen.
* **[SPENDLY-129](https://kesavach.atlassian.net/browse/SPENDLY-129)** — trip /
  split / vault relationship checks, blocked on those collections reaching the
  ledger screen. Must not be solved by adding reads to a read-only diagnostic;
  wants an explicit on-demand deep scan.
* **[SPENDLY-130](https://kesavach.atlassian.net/browse/SPENDLY-130)** — include
  soft-deleted rows in the audit input so orphan findings can distinguish
  *removed* from *missing*, and `deleted_row_still_referenced` becomes possible.
* **[SPENDLY-131](https://kesavach.atlassian.net/browse/SPENDLY-131)** — the
  cross-collection money checks scoped out of this ticket.
* **[SPENDLY-132](https://kesavach.atlassian.net/browse/SPENDLY-132)** —
  deep-link a finding to SPENDLY-110's detail sheet (`focusTransactionId` on
  `ExpenseList`). Served for now by Show in Journal.

**A rule, not a ticket:** the audit engine never gains a write path. If a future
ticket wants one-tap correction it goes through
`services/ledger/mutateLedgerTransaction.ts` with a `reason` on the audit
event — the route SPENDLY-110's restore took — and this engine stays pure.

---

## 8. Ticket hygiene

* SPENDLY-112 → **In Progress**; scope commented on the ticket.
* PR targets **`ledger-v2`**, `SPENDLY-112` in the title, browse URL in the body.
* Stays **out of Done**: the code lives only on `ledger-v2` until the epic's
  final merge to `main`.
* Next in the epic: **SPENDLY-113** Journal reports and export suite.
