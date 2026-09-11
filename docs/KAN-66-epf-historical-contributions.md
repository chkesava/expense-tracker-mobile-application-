# KAN-66 — EPF: Historical Month-by-Month Contributions

| | |
|---|---|
| **Jira** | [KAN-66](https://kesavach.atlassian.net/browse/KAN-66) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-66-epf-historical-contributions` |
| **Date** | 2026-09-11 |
| **Builds on** | [KAN-65](./KAN-65-epf-data-model.md) |

## Why

KAN-65 gave EPF an identity layer but stores no money. This ticket is where the
module gains value: someone installing Spendly today has years of past
employment whose PF contributions exist only on the EPFO portal.

The hard part was never the data model — it is that backfilling three years by
hand is ~36 rows × 5 money fields, and a design demanding 200 manual inputs
produces abandoned or garbage data. So the shape of the feature is: **generate
the months, compute the money from a wage, make correction cheap.**

## Data model

```
users/{uid}/epfContributions/{establishmentId}_{YYYY-MM}
```

**A deterministic composite id, not an auto-id.** The ticket forbids duplicate
establishment+month records, and client-SDK transactions *cannot read queries*,
so a transactional existence check is impossible. Putting identity in the key
makes a duplicate structurally unrepresentable and every write idempotent under
`setDoc(…, { merge: true })` — re-saving converges instead of duplicating.
Precedent: `portfolioSnapshots/{YYYY-MM-DD}`.

Two field names matter and must never be collapsed into one "total":

| Field | Meaning |
|---|---|
| `totalContribution` | `employeeShare + employerShare` — what a payslip shows |
| **`epfCredit`** | `employeeShare + employerEpfShare` — **the balance increase.** KAN-71 must consume this |

`epsShare` is diverted to pension and never reaches the EPF balance. That is the
epic's "employer contribution ≠ the amount added to EPF" made concrete.

Stored totals are **always recomputed from the parts on read** by
`normalizeEpfContribution`, so a stale stored total can never display.

## The computation

```
rule             = findEpfContributionRule(month)
employeeShare    = round(wage × 12%)
employerShare    = round(wage × 12%)
epsShare         = epsEligible ? round(min(wage, ceiling) × 8.33%) : 0
employerEpfShare = employerShare − epsShare
```

| Case | wage | month | employee | employer | EPS | employer→EPF | **epfCredit** |
|---|---|---|---|---|---|---|---|
| Below ceiling | 12,000 | 2021-06 | 1,440 | 1,440 | 1,000 | 440 | **1,880** |
| Above ceiling, EPS member | 50,000 | 2024-08 | 6,000 | 6,000 | **1,250** | 4,750 | **10,750** |
| Above ceiling, not EPS | 50,000 | 2024-08 | 6,000 | 6,000 | 0 | 6,000 | **12,000** |
| Pre-2014 ceiling | 20,000 | 2013-05 | 2,400 | 2,400 | **541** | 1,859 | **4,259** |

Row 2 is the point of the field split: the employer paid 6,000, but 4,750
reached the fund.

**Rounding:** the four statutory shares round to **whole rupees**; sums use
`roundMoney`. Not a deviation from the rupee-float money rule — results are
still rupee floats and every sum is guarded. It is a correctness choice: 8.33%
of 15,000 is 1,249.5 but the recognised EPS figure is ₹1,250, and 8.33% of 6,500
is 541.45 against a statutory ₹541. Two-decimal rounding reproduces neither, and
anyone comparing against their passbook would read it as a bug.

### Rate table

`shared/features/epf/data/epfRules.ts` is effective-dated (₹6,500 → ₹15,000 from
2014-09-01) rather than a constant, so an employment spanning the change
computes correctly on both sides. Interest rates deliberately live elsewhere
(KAN-70, keyed by financial year) — interest is *declared* per FY while
contribution slabs change mid-year, and one table cannot key both honestly.

Deliberately unmodelled and reachable only by per-row override: the 10%
establishment category, and the May–Jul 2020 COVID relief rate. Both are
establishment-conditional rather than date-only; encoding them here would
produce wrong numbers for most users.

## Status and source — two orthogonal axes

The epic lists Expected/Credited/Missed/Partial/Manual/Transferred/Reversed as
one set, but that conflates **lifecycle** with **provenance**. Collapsing them
into a single enum is what would block KAN-67/68/69.

- `EpfContributionStatus` — `draft` | `confirmed` (KAN-66), plus
  `expected`/`credited`/`partial`/`missed`/`reversed` reserved.
- `EpfContributionSource` — `manualHistorical` (the only value KAN-66 writes),
  plus `manualCurrent`/`simulated`/`imported`/`transferIn` reserved.

### "Historical records never enter the future cron queue"

Three independent guarantees:

1. `isEligibleForAutomatedProcessing(row, currentMonth)` is **shipped and tested
   in this ticket**, before the processor exists. Its tests assert it returns
   false for *every row KAN-66 can write*, which makes the acceptance criterion
   provable today.
2. Generation is scoped to `findActiveEstablishment()`, which excludes archived
   and previous establishments.
3. The deterministic id means a future generator targeting a backfilled month
   collides rather than duplicating.

> **Contract for KAN-67:** never `setDoc(merge)` over a row whose
> `source === "manualHistorical"`. Any establishment is backfillable, so a
> current employer's months can already exist before the processor runs.

## Files

| File | Role |
|---|---|
| `shared/utils/dates.ts` | `shiftMonthKey` promoted from two private copies; `monthKeysBetween` with a `MAX_MONTH_RANGE` cap |
| `shared/utils/financialYear.ts` | Apr–Mar bucketing — generic, because KAN-70 and KAN-71 need it too |
| `shared/features/epf/data/epfRules.ts` | Effective-dated rate table |
| `shared/features/epf/utils/contributions.ts` | All decision logic |
| `shared/features/epf/schemas/index.ts` | Wage, setup and row form schemas |
| `hooks/useEpfContributions.ts` | Per-establishment listener + chunked bulk save |
| `app/(app)/epf/[establishmentId].tsx` | History / Backfill route |
| `components/epf/EpfBackfillScreen.tsx` | Setup card, FY-grouped list, totals footer |
| `components/epf/EpfContributionHistory.tsx` | Read-only FY-grouped history |
| `components/epf/EpfContributionRow.tsx` | `memo`'d read-only row, primitive props only |
| `components/epf/EpfContributionEditSheet.tsx` | Per-month override editor |

`shiftMonthKey` was privately duplicated in `shared/utils/spendlyBudget.ts` and
`components/analytics/MonthlyAnalyticsView.tsx`; both now use the shared copy.

## Design decisions

| Decision | Outcome |
|---|---|
| Entry model | Auto-compute from wage, per-row override. An edited row is flagged `overridden` and is never silently recomputed |
| Row creation | **Lazy** — months are generated in memory; only filled rows become documents, so the collection never accumulates empty placeholders |
| Drafts | Firestore, `status: "draft"`, promoted on Save All. Survives reinstall and syncs across devices |
| Scope | Backfill entry + history view. Net-worth and dashboard wiring stay with KAN-71 |
| EPS membership | Per-establishment `epsMember` toggle, default on, pre-fillable from the earliest joining date. Never decided silently — getting it wrong misstates the balance by the EPS cap every month |
| Backfillable establishments | **Any**, clamped at the current month — a five-year current job has just as much history, and KAN-67 is blocked anyway |
| UI | Read-only rows + edit sheet, **not** inline inputs (below) |

### Why rows are read-only with an edit sheet

1. A virtualizer recycles views, and recycled rows carrying controlled
   `TextInput`s bleed values between months, lose focus on scroll and fight the
   IME. Nothing in this repo does it — `ReconcileStatementModal.tsx`, the only
   long FlashList editor here, has no per-row inputs.
2. Auto-compute means the expected number of hand-edited rows is near zero.
   Inline inputs optimise the rare path at the cost of the common one.
3. Eight editable fields do not fit a phone-width row.
4. A read-only row with an "Edited" badge shows which numbers are yours.

The real bulk-edit need is a wage change, served by changing the wage and
letting every non-overridden row recompute.

## Rules, indexes, migration

- `firestore.rules` — inventory doc-comment only. **No rule logic change**; the
  recursive owner grant covers the new collection.
- `firestore.indexes.json` — **no change.** The listener filters
  `where("establishmentId","==",id)` with no `orderBy` and sorts client-side, so
  only the automatic single-field index is needed and there is no deploy
  dependency. This **supersedes the KAN-65 doc's prediction** that
  `establishmentId ASC + month DESC` would be required. KAN-75 remains the
  holistic index review.
- **No migration.** New collection; `epsMember` on establishments is optional
  with a tolerant read.

## Tests

| File | Count |
|---|---|
| `shared/features/epf/utils/contributions.test.ts` | 54 |
| `shared/features/epf/schemas/index.test.ts` | +13 (28 total) |
| `shared/utils/financialYear.test.ts` | 12 |
| `shared/features/epf/data/epfRules.test.ts` | 9 |
| `shared/utils/dates.test.ts` | +7 (18 total) |
| `firestore/personalData.rules.test.ts` | +4 EPF contribution cases |

Full suite: **1964 unit** and **162 rules** tests pass.

## Known limitations

1. **A single draft arms the KAN-65 delete guard** — the moment one draft row
   exists, `deleteEstablishment` refuses and tells the user to archive instead.
   Mitigated by a "Discard drafts" action on the backfill screen. Narrowing the
   guard to ignore drafts is *not* advisable: inequality filters need an index,
   drop documents missing the field, and the guard must fail closed.
2. **Closed-period overlap and EPS eligibility remain user-assertable.** The app
   validates arithmetic and dates, not whether the user's recollection matches
   EPFO. This is a personal tracker, not an official record.
3. **Not verified on device.** Everything below is automated tests and
   typechecks only.

## Manual testing guide

```bash
npm test                  # dates, financialYear, epfRules, contributions, schemas
npm run typecheck         # and typecheck:shared
npm run test:rules        # emulator; epfContributions ownership
npx expo start            # hot reload; regenerates typed routes for /epf/[establishmentId]
```

1. Investments → **EPF** → an establishment card now shows a **Contributions**
   action. Tap it.
2. The **History** tab shows an empty state; tap **Add months** → **Backfill**.
3. For an employer joined 2021-06 and left 2024-08, 39 month rows appear grouped
   by financial year, all "Not recorded".
4. Enter wage **25000** → every row computes you 3,000 · employer 3,000 ·
   pension **1,250** · **4,750 into EPF**; the footer total updates live.
5. Change the wage to **12000** → pension shows **1,000**, not the capped 1,250.
6. Turn **Pension (EPS) member** off → pension becomes 0 and the full employer
   share goes to EPF.
7. Tap a month → edit sheet → change your contribution → the row shows an edit
   marker and totals update. **Recompute from wage** restores the statutory split.
8. **Save draft** → leave the screen and return → rows persist, marked Draft.
9. **Save all** → rows become Manual. If any month has an error the dialog
   offers to save the rest.
10. Edit one month and save again → **no duplicate row appears** (deterministic id).
11. History tab → contributions grouped by FY with per-year and grand totals.
12. Back on the EPF tab, try to **delete** that establishment → refused with
    "Archive it instead" — the KAN-65 guard, live for the first time.
13. Archive the establishment → its contributions still resolve.
14. Repeat on Web.
