# KAN-70 — EPF: Interest, Financial-Year Rules & Reconciliation

| | |
|---|---|
| **Jira** | [KAN-70](https://kesavach.atlassian.net/browse/KAN-70) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-70-epf-interest-reconciliation` |
| **Date** | 2026-09-12 |
| **Builds on** | KAN-65 · [66](./KAN-66-epf-historical-contributions.md) · [67](./KAN-67-epf-contribution-cron.md) · [68](./KAN-68-epf-credit-lifecycle.md) · [69](./KAN-69-epf-transfers.md) |

## Why

EPF balances grow by interest, not just contributions. Until now a balance was
purely the sum of money paid in — which over a ten-year employment understates
the fund by roughly a third.

This adds the missing half: interest computed the way EPFO actually computes it,
and a way to correct Spendly's picture against a real passbook.

## The calculation

EPFO accrues on the **monthly running balance** and credits the year's total at
financial-year end:

```
interest(FY) = Σ over 12 months ( that month's closing balance × rate ÷ 12 )
```

The simpler alternatives all disagree with a passbook. Annual interest on the
*closing* balance understates badly for anyone contributing monthly — a year of
contributions earns for an average of six months, not zero. **A simulation that
disagrees with the document the user is holding is worse than no simulation**,
so this does it the real way.

Each year opens on the previous year's close **including its interest**, so the
years chain and interest compounds. That is why `interestSchedule` produces the
whole chain rather than answering per year.

Hand-checkable figures, all in the tests:

| Case | Interest |
|---|---|
| ₹10,000 present all twelve months, 8.25% | **₹825** — exactly the annual rate |
| ₹12,000 arriving in March only, 8.25% | **₹82.50** — exactly one twelfth |
| ₹10,000 contributed Apr 2023, two years | 825 then **893.06** — compounding on 10,825 |

## Rates — and honestly missing ones

`shared/features/epf/data/epfInterestRates.ts`, FY-keyed. A **separate file**
from `epfRules.ts`: contribution slabs change on arbitrary mid-year dates while
interest is *declared per financial year*, and one table cannot key both
honestly — the reasoning recorded back in KAN-67.

`findEpfInterestRate` returns **`null` for an undeclared year**, which is a
normal state rather than an error: EPFO announces a rate months after the year
ends, so the current year always lacks one. Those years are reported as
`rateMissing` and show "Rate not declared yet" — never zero interest, which
would read as a loss or a bug. No rate is ever guessed.

The table needs a row added when EPFO declares each year; it is expected to be
incomplete at the tail.

## Stored interest entries

```
users/{uid}/epfInterestEntries/{establishmentId}_{financialYear}
```

The deterministic id is the whole idempotency story — the same trick as
contributions. Recomputing a year **overwrites** its entry and cannot create a
second, so "no duplicate interest events" falls out of the key rather than a
guard someone has to remember.

Each entry stores the `rate` actually used and `computedAt`. That is the audit
trail: if a rate is later corrected, the difference between the stored rate and
the table is visible rather than silently reflowing history.

Years with no declared rate are **not written at all** — a stored zero would be
indistinguishable from a year that genuinely earned nothing.

## Reconciliation

```
users/{uid}/epfReconciliations/{autoId}
```

Append-only observations, so repeated reconciliations accumulate as history by
construction. Each stores the actual balance, the calculated balance **and** the
resulting adjustment — keeping all three means the correction stays explainable
later instead of becoming an unexplained delta.

The adjustment moves the balance. **No contribution row is ever touched**, which
the ticket forbids outright.

## `establishmentBalance` is now the full ledger

```
balance = credited contributions
        + completed transfers in − completed transfers out
        + credited interest
        + reconciliation adjustments
```

Building it once in KAN-69 made this a small extension rather than three
competing definitions.

**The new inputs are required, not optional.** A caller that forgot them would
silently under-report a balance by every rupee of interest ever earned, and
nothing would catch it — failing to compile is the cheaper failure. The change
broke both KAN-69 call sites on purpose, and they now thread interest and
adjustments through.

`establishmentBalanceBreakdown` returns the parts, so the UI can show why the
number is what it is. A test asserts the parts sum to the total.

### Settled: reversed months are excluded, not subtracted

KAN-68 and KAN-69 both deferred this here. A `reversed` month **never landed**,
so it was never added — excluding it is correct, and subtracting would
double-count the removal. The row stays for audit and contributes zero.

## Files

| File | Role |
|---|---|
| `shared/features/epf/data/epfInterestRates.ts` | FY rate table, `null` when undeclared |
| `shared/features/epf/utils/interest.ts` | Monthly balances, per-year interest, the chained schedule |
| `shared/features/epf/utils/reconciliation.ts` | Variance, validation, history |
| `shared/features/epf/utils/transfers.ts` | Balance extended into the full ledger |
| `hooks/useEpfInterest.ts` | Both listeners, `recomputeInterest`, `recordReconciliation` |
| `components/epf/EpfBalanceTab.tsx` | Breakdown, interest by year, reconcile, history |
| `components/epf/EpfReconcileSheet.tsx` | Record the EPFO figure, variance shown before confirming |

One **Balance** tab rather than two more: it answers a single question — "why is
my balance this number?" — and splitting interest from reconciliation would have
scattered the answer.

The route's tab row was a plain `View`; with five tabs it would clip on a narrow
phone, so it is now a horizontal `ScrollView`.

## Rules and indexes

- `firestore.rules` — inventory comment only. **No rule logic change**; the
  recursive owner grant covers both new collections, which is the ticket's
  authorization requirement.
- `firestore.indexes.json` — **no change**; both listeners are unfiltered. Keep
  the file a superset of live (KAN-78).

## Tests

| File | Count |
|---|---|
| `interest.test.ts` | 24 |
| `reconciliation.test.ts` | 21 |
| `epfInterestRates.test.ts` | 8 |
| `transfers.test.ts` *(extended)* | 40 (5 new ledger cases) |
| `personalData.rules.test.ts` | +4 |

Full suite: **2180 unit**, **174 rules**, both typechecks clean, both Netlify
bundles verified to load under the CJS runtime.

## Known limitations

1. **Interest compounds on a balance nobody has verified on a device.** Six EPF
   tickets shipped without a device pass; v0.3.8 is with testers now. If
   contributions are wrong, interest is wrong by a larger margin and quietly.
2. **Recompute runs on opening the Balance tab**, once per mount. The
   deterministic id makes that safe, but interest for a just-ended year only
   appears after someone opens the tab or the monthly cron runs.
3. **Adjustments are attributed to the month they were observed in**, so they
   earn interest from that month forward. Defensible, but a correction for an
   older period does not retroactively earn.
4. **The epic asks for integer minor units again.** Same resolution as KAN-66:
   rupee floats with `roundMoney`, which is what "consistent with Spendly" — the
   ticket's own wording — actually means.

## Manual testing guide

1. With an establishment backfilled across two financial years, open **Balance**
   → the breakdown shows contributions and interest, and the parts add to the
   total.
2. **Interest by financial year** lists each year with the rate used.
3. A year EPFO has not declared shows **"Rate not declared yet"** and a dash —
   not zero.
4. Leave and reopen the tab → interest does not double; entries are overwritten.
5. **Record EPFO balance** higher than Spendly's → the variance appears before
   confirming; confirming moves the balance to match.
6. Check **History** → every monthly contribution row is unchanged.
7. Record a second observation → both are kept, newest first.
8. On a narrow phone, the five tabs **scroll** rather than clip.
9. Repeat on Web.
