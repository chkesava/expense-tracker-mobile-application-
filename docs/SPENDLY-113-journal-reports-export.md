# SPENDLY-113 — Journal reports and export suite

**Ticket:** [SPENDLY-113](https://kesavach.atlassian.net/browse/SPENDLY-113) — *Journal reports and export suite* (Task, High)
**Epic:** [SPENDLY-102](https://kesavach.atlassian.net/browse/SPENDLY-102) Ledger Intelligence & Financial Journal — **the last ordered ticket**
**Integration branch:** `ledger-v2` (PR targets `ledger-v2`, never `main`)
**Baseline:** `ledger-v2` @ `087cbbe` (SPENDLY-109 + 111 + 110 + 112)
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Status:** Implemented on `feat/SPENDLY-113-journal-reports-export`. `npm test` (277 files / 3951 tests), `npm run typecheck` and `npm run typecheck:shared` all pass.

---

## 1. Context

The Journal could be searched (109), totalled (111), inspected row by row with
an audit trail (110) and checked for integrity (112). What a user still could
not do is **get the data out**.

What existed was worse than nothing in one specific way.
`components/analytics/ExportDataModal.tsx`, reached from Insights, read
`useExpenses()` / `useIncomes()` and **ignored `complete`**. Because
`expensesLoading` goes false on the staged 300-row page, a cold start — or the
~1.2 s before the idle upgrade lands — exported whatever happened to be loaded,
with no warning, while its own "All History (N)" chip stated the truncated count
as fact. That is precisely the failure this ticket's "never silently truncate"
clause names, already shipped.

Meanwhile the Journal's `data` sub-tab was a placeholder `EmptyState` titled
"Data & Backup Vault" whose two buttons routed to `/settings` — which contains
no export or backup UI at all. Both were dead ends.

---

## 2. Design

### 2.1 One CSV writer, and the formula-injection hole nobody had closed

Five modules had grown their own RFC-4180 escaper — account statements, the
Ganesh report, the credit-card cycle, prasadam, and the legacy transactions
export — with **three different line endings between them** and **no injection
guard in any of them**. A Journal note reading `=cmd|'/c calc'!A1` went into the
file verbatim, and Journal notes are free text.

`shared/utils/csv.ts` is the one writer. The guard neutralises a dangerous cell
by **prefixing `'` and force-quoting** — `"'=SUM(A1:A9)"` — so Excel renders the
literal text and **not one character of what the user typed is lost**. Stripping
the `=` would have been simpler and is what most implementations do; it is also
quietly editing data on the way out of an export whose entire promise is
fidelity.

**The trap is `-250`.** A guard that prefixed everything starting with `-` would
turn every negative amount into text and break every downstream `SUM`. Two
defences, in order:

1. **Type separation.** Money and counts go through `csvNumber`, which **never
   enters the guard**. The question "is this a negative number or a formula?" is
   never asked, because the renderer's column table already answered it.
2. **A numeric escape hatch** in `csvField` for a text cell that is entirely a
   number — the note that literally reads `-250`, the category named `+1`.

Tab, CR and LF are guarded alongside `= + - @`: the formula engine eats them as
leading whitespace and evaluates what follows, so a guard checking only `=` is
walked straight past by `"\t=cmd|…"`.

`csvNumber` carries forward `accountStatementExport`'s rule that a missing value
is **blank, not `0`** — an empty cell says "not this side of the ledger", where a
zero says "nothing moved", and a debit column of invented zeroes is a different
statement from the one the user has.

**What the migration changed, and how it was made safe.** Three of the five
copies joined with `\n`; all five now use CRLF. `csvExport.test.ts` split on
`"\n"` and asserted the header, so that assertion was updated rather than worked
around. `ganeshPrasadamExport`'s local regex was `/[",\n]/` — **missing `\r`** —
so a note pasted from Windows silently broke the row; delegating fixes it, and a
test asserts the fix. `creditCardStatementExport` **had no test at all**, so it
got a characterisation suite written against its existing behaviour *before* the
swap; two of its quirks are pinned rather than changed (the truncation message
wording, and a file name whose `card` fallback fires only on an empty slug, not
on a name of pure punctuation).

### 2.2 The report model computes; the renderers do not

`shared/utils/journalReport.ts` mirrors `accountStatement.ts`: it computes every
figure so `journalReportExport.ts` can compute none. That is what makes it
impossible for the spreadsheet and the PDF to disagree about a total — not a
convention, a structure.

#### Built from `runningBalance.rows`, not from `filtered`

`runJournalFilterPipeline` returns `filtered` in provider order: **every expense,
then every income**, each newest-first by `createdAt`. A file in that order puts
all the income below all the spending, which nobody would recognise as "the
transactions I was looking at".

`runningBalance.rows` is the same set ordered by `postingSortMs` with an id
tie-break, and it is exactly what `ExpenseList` renders. Building from it buys
four things: the file matches the screen row for row; `cashFlowToDate` and
`cardSpendToDate` come free and cannot disagree with the on-screen column;
re-exporting an unchanged view is byte-identical; and there is one chronological
sort in the codebase rather than two.

**Oldest-first in the file, newest-first on screen.** A cumulative column only
reads correctly accumulating downward with the reader's eye — `statementToHtml`
already argues this. Both renderers use the one direction, and the divergence
from the screen is **stated in the preamble** (`Order,Oldest first — the app
lists them newest first`) rather than left to be discovered halfway down a
reconcile.

#### The header carries the *raw* filters, not `effectiveFilters`

`effectiveFilters` has the resolved month range injected. Using it would list
`From: 2026-09-01` / `To: 2026-09-30` as applied filters on a view where the
user only picked a month — reporting the period twice and disagreeing with the
chips on the History tab. The header takes `journalFilters`; the period line
takes `dateScope`.

#### Three date shapes, none of them invented

`resolveJournalDateScope` can return a verbatim one-sided range, a month
expanded to first/last day, or nothing at all. The header says
`From 2026-09-01`, `Up to 2026-09-30`, `2026-09-01 to 2026-09-30` or
`All dates` accordingly. Clamping an open range to the selected month, or
printing today as a closing bound, would both be inventions — and an invented
bound on an exported file is the kind of thing someone reconciles against and
cannot explain.

### 2.3 Never silently truncating — three layers

1. **The engine gate.** `buildJournalReport` refuses without
   `expensesComplete && incomesComplete`, scope-aware. This is the only layer
   that can see Firestore staging, and — since `components/**` is outside the
   vitest include — the only one the test suite can reach. SPENDLY-112 §2.4's
   rule, applied again: *a UI gate is a promise, a precondition is a guarantee.*

   `unavailable` is a **discriminated union** here, deliberately unlike
   `LedgerAuditReport`'s flat status field. An audit report's reader is a panel
   that can show zero findings harmlessly; this report's reader **writes a
   file**. Making `report` unreachable in that branch turns "you exported a
   partial ledger" from something review has to catch into a type error.

   The income sub-tab's "don't wait on expenses you never show" rule moved out
   of `ledger.tsx` and into the function, where it is testable.

2. **The row-count assertion.** `assertJournalReportComplete`, modelled on
   `assertCycleExportComplete`, called once in the model and again at the top of
   each renderer. This answers a *different* question: not "did the ledger
   finish loading" but "did **we** drop rows on the way" — a slice added for
   pagination, a map that skipped a malformed row, a branch capped at N. Layer 1
   is structurally blind to all of those.

3. **The UI.** Both buttons disabled behind an "Exports paused" panel. A
   courtesy on top of a guarantee, never a substitute for one.

### 2.4 Progress: a row count, not a bar

There is no determinate progress component in the repo, and this ticket does not
add one. `Print.printToFileAsync` is the only genuinely slow step and it exposes
**no progress callback**, so a percentage over it would be an animation rather
than information. This epic already refuses to show figures the system cannot
support — it will not call a movement a balance, and it hides totals while
truncated. A fake progress bar is the same category of lie.

The truthful signal is known *before* any work starts: the row count. The button
reads **"Exporting 4,812…"**. Only the PDF asks first, above 5,000 rows, because
it is the one path that can stall for seconds with no cancel.

**No success toast.** `Sharing.shareAsync` resolving does not mean the user saved
anything — `accounts/[id].tsx` says nothing on success and that is the right
precedent.

### 2.5 The workspace explains itself, because the filter bar is not there

`isFilterableTab` excludes `data`, so the workspace has to describe its own
dataset: the row count, the resolved period, and the active filter chips
rendered from `describeAccountActivityFilters` — **the same function the History
tab uses**. That turns "we are exporting your current filters" from a claim the
user must trust into one they can verify at a glance, and it is the whole payoff
of extracting the labels. The preview strip reads the *report's* totals, so what
is previewed and what is written are the same object.

The filter bar is deliberately **not** duplicated here; a second UI writing the
same state would drift from the first. There is an "Edit filters in History"
button instead, and History/Income gained an export action that switches here.

**Scroll ownership is untouched.** `data` is the only sub-tab where `PageShell`
owns the scroll, so the workspace contains no `ScrollView` and no `FlashList` —
which is also the second, independent reason the preview is totals and chips
rather than a table of rows. Neither `isExpenseListTab` nor `isFilterableTab`
changed.

### 2.6 One delivery module, and two bugs fixed on the way

Three Spendly exports had their own copy of write-file-and-share, and the copies
had already drifted. `services/export/fileDelivery.ts` is the one copy; folding
the other two onto it fixes:

* the credit-card cycle export wrote **no byte-order mark**, so Excel on Windows
  mojibaked the currency symbol and any non-Latin merchant name;
* the same export had **no web branch**, so on web it tried to write into a
  document directory that does not exist there;
* `accountStatementDelivery` passed a **MIME type in the `UTI` slot** iOS expects
  a UTI in.

`services/ganesh/ganeshReportDelivery.ts` is **deliberately left alone**:
importing across the product boundary is what the multi-app separation rules
forbid, and every doc in this epic says Spendly only.

### 2.7 What the PDF adds, and what it must not

Formatted money, the applied filters as chips, and **the period breakdown** — a
400-row grid is unreadable on paper and the buckets are the reason to print one
at all. A spreadsheet user pivots instead, so the CSV omits it rather than
carrying a second set of numbers to keep in step.

Print mechanics are copied verbatim from `statementToHtml`:
`@page { margin: 16mm 12mm }`, `thead { display: table-header-group }`,
`tr { page-break-inside: avoid }`, summary kept whole, and **notes above the
summary** — a caveat discovered on the last page, after the totals have been
taken at face value, is a caveat that has already misled.

It adds **no figure the CSV lacks**.

### 2.8 The epic's invariants, carried into the file

| Invariant | How the export honours it |
|---|---|
| One row per Expense and per Income, nothing else | The report is built only from journal rows. There is no code path to `AccountPayment`, and a note in every file says card payments are not journal rows and are not counted. |
| A card purchase is in `spent` but never in `cashOut` | Both travel, plus an `Account type` column so `cardSpent` is reconcilable from the grid itself. |
| The cumulative figure is not a balance | The column is `Cumulative net cash movement`. A test asserts neither renderer's header contains the word "balance". |
| `accountName` ≠ `counterparty` | There is **no Counterparty column at all** — journal rows have no other side, and a column of blanks invites someone to fill it with the account name. |
| A range overrides the month, verbatim | §2.2. |
| Don't overload the shared filter bar | One optional `action` prop, absent at both existing call sites. `headingCopy`'s `flex: 1` means the third child right-aligns beside the filter button with no wrapper. |

---

## 3. Files

**New**

| File | Purpose |
|---|---|
| `shared/utils/csv.ts` | `csvField`, `csvNumber`, `csvRow`, `joinCsvLines`, `CSV_LINE_ENDING` |
| `shared/utils/accountActivityFilterLabels.ts` | `describeAccountActivityFilters`, `accountActivityFilterLabels` |
| `shared/utils/journalReport.ts` | `buildJournalReport`, `assertJournalReportComplete` |
| `shared/utils/journalReportExport.ts` | `journalReportToCsv`, `journalReportToHtml`, `journalReportFileName` |
| `services/export/fileDelivery.ts` | `deliverCsv`, `deliverPdf`, `shareFile`, `exportDirectory` |
| `services/ledger/journalReportDelivery.ts` | `exportJournalReportCsv`, `exportJournalReportPdf` |
| `components/ledger/JournalReportWorkspace.tsx` | The `data` sub-tab |
| + 5 colocated `*.test.ts` | 122 new cases |

**Changed**

| File | Change |
|---|---|
| `shared/utils/{accountStatement,ganeshReport,creditCardStatement,ganeshPrasadam,csv}Export.ts` | Delegate to the shared writer |
| `components/accounts/TransactionFilters.tsx` | Labels extracted; one optional `action` prop |
| `services/accounts/accountStatementDelivery.ts`, `services/creditCardBills/creditCardStatementExportShare.ts` | Delegate to `fileDelivery` |
| `app/(app)/ledger.tsx` | The workspace replaces the dead placeholder; report memo, export handler, filter-bar action |
| `components/analytics/ExportDataModal.tsx` | The truncation gate, and a visible error on failure |

No rules change, no index change, no provider change, and **no new dependency** —
`expo-file-system`, `expo-sharing` and `expo-print` were already installed.

---

## 4. Tests

122 new cases; the existing 3,829 are the regression net.

* **`csv.test.ts`** (21) — `-250` staying a number; `=` neutralised without
  losing a character; `+`, `@`, tab and CR guarded too; a dangerous cell that
  merely *starts* like a number (`-1+cmd`) still guarded; RFC-4180 quoting and
  quote-doubling; CRLF; a blank separator line preserved; a missing amount
  rendering blank rather than `0`.
* **`accountActivityFilterLabels.test.ts`** (12) — the golden chip order,
  transcribed from the component; `Account:` and `With:` never conflated; `"0"`
  as a real minimum; and a **source scan** asserting `TransactionFilters` holds
  no second copy of the labels.
* **`journalReport.test.ts`** (37) — an incomplete ledger reporting
  `unavailable` and specifically not an empty ready report; the income scope
  gated on `incomesComplete` alone; one row per record with no extra leg pulled
  in; oldest-first ordering despite `filtered`'s shape; the last row's
  cumulative figure tying to `totals.netCash`; a card purchase leaving the cash
  line untouched; an open-ended range stated as "From X"; an unscoped view as
  "All dates"; the cumulative figure never called a balance; inputs not mutated.
* **`journalReportExport.test.ts`** (33) — the resolved range, generated time and
  every filter label in the header; **no Counterparty column**; Category empty
  and Source filled on an income row; raw numbers in amount cells with no `₹`
  anywhere; the blank other side of the ledger; a note starting `=` neutralised
  in the CSV and escaped in the HTML; CSV and HTML agreeing because neither
  computes; both refusing a tampered row count; the repeating `thead`, the
  no-split rows and the notes above the summary; file names for all four range
  shapes and the `-filtered` infix.
* **`creditCardStatementExport.test.ts`** (17, new) — characterisation written
  before the helper swap.
* Existing suites: `csvExport.test.ts` (the CRLF split),
  `ganeshPrasadamExport.test.ts` (+2, the bare-CR bug now fixed).

**Not covered.** `JournalReportWorkspace.tsx` has no render test —
`components/` is outside the vitest `include` repo-wide, tracked as
**SPENDLY-126**. Neither delivery module is tested either: `services/**` *is* in
the include, but `expo-file-system` cannot be imported under
`environment: "node"` without a mock, which is why `accountStatementDelivery`
had no test before this ticket and still has none.

---

## 5. Manual verification

**Commands:** `npx expo start` — hot reload covers it. No build, native step,
rules deploy, index change or Netlify deploy.

Journal → **Data**:

1. **Cold start.** "Exports paused", worded like the History tab's own banner.
   After the idle upgrade it becomes exportable.
2. **Filters travel.** On History set a category filter and a search term, then
   switch to Data — the same chips and the same row count. Export CSV: the
   preamble lists those filters, the resolved range, and a matching row count.
3. **Month vs range.** Set a one-sided range (`From` only): the header reads
   "From 2026-09-01", not a fabricated closing date, and says the month was
   overridden. Clear it and the month's range returns.
4. **Injection.** Add an expense whose note is `=1+1`. In Excel the cell shows
   the literal text, not `2`, with nothing lost — and a `-250` amount is still a
   number `SUM` accepts.
5. **Order.** The CSV is oldest-first, the screen newest-first, and the preamble
   says so. The last row's cumulative figure equals the summary's net cash
   movement.
6. **PDF.** Print a multi-page range: the header repeats on every page, no row
   splits, notes sit above the summary, the period breakdown appears, and the
   totals match the CSV.
7. **Web.** CSV downloads as a file; PDF opens the print dialog.
8. **Policy.** With `allowDataExport` off, the buttons are replaced by the policy
   line.
9. **Regression.** The account-detail and credit-card filter bars are unchanged
   (no new action button); their statement and cycle exports still work — the
   cycle CSV now opens correctly in Excel with a currency symbol; the Ganesh
   report export is untouched.
10. **Insights.** On a cold start the old modal now refuses with "Still loading
    your full history" instead of shipping 300 rows.

---

## 6. Follow-ups raised

* **[SPENDLY-133](https://kesavach.atlassian.net/browse/SPENDLY-133)** — migrate
  `ExportDataModal` off `Share.share({ message })`; on a large payload that is a
  *second* truncation vector via Android's binder limit.
* **[SPENDLY-134](https://kesavach.atlassian.net/browse/SPENDLY-134)** — fold
  the Ganesh report delivery onto the shared module.
* **[SPENDLY-135](https://kesavach.atlassian.net/browse/SPENDLY-135)** — backup,
  restore and cloud sync, which the removed tile promised and nothing implements.

**A rule, not a ticket:** the report engine never gains a write path and never
enriches rows. If a future report wants "paid on cards" it reads `cardSpent`; it
does not add payment legs.

---

## 7. Ticket hygiene

* SPENDLY-113 → **In Progress**; scope commented on the ticket.
* PR targets **`ledger-v2`**, `SPENDLY-113` in the title, browse URL in the body.
* Stays **out of Done**: the code lives only on `ledger-v2` until the epic's
  final merge to `main`.
* **This is the last ordered ticket in SPENDLY-102.** Once it merges the epic is
  code-complete, and what remains is the user-requested final `ledger-v2` →
  `main` merge — at which point 109, 110, 111, 112 and 113 move to Done together
  and the epic section comes out of `CLAUDE.md`.
