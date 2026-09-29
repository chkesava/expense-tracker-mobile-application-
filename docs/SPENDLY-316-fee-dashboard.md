# SPENDLY-316 — Fee & Charges dashboard and cost overview

**Ticket:** [SPENDLY-316](https://kesavach.atlassian.net/browse/SPENDLY-316) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-316-fee-dashboard`, cut from the epic branch after 315.
**Depends on:** 313 (totals), 314 (engine), 315 (screen, reviews)
**Scope:** Spendly only. No rules, index or data-model changes.

---

## 1. What users see

`/fees` opens on a new **Overview** tab, next to Review and All fees. From top to bottom:

* **Period chips:** This month / 3 months / This year / 12 months / All time.
* **Filters sheet:** account or card, fee type, and bank or provider.
* **Review banner:** shown when there are candidates to check.
* **Hero:** *Fees paid*, meaning fees plus GST on fees after reversals. It splits into Fees / GST on fees / Reversed. Interest is stated on a separate line, and this month is compared with last month.
* **Trend:** the last 12 months, using the existing `BarChart` (one hue, tap a bar for its value).
* **Breakdowns:** by fee type, by account or card, and by top fee sources (providers). Each row has a share bar and its fee / GST / reversed parts.
* **Recent fees:** tap one to open the 315 review sheet.
* **Empty state:** first-time users see an explanation instead of zeros, plus a shortcut to the review queue if there are candidates.

The Insights entry card now also shows this month's fee cost.

## 2. Design

### 2.1 One sum
Every figure in `buildFeeDashboard` is `feeComponentTotals` (from 313) run over a
subset of records. The breakdowns and the trend therefore add up to the headline
by construction, and the tests assert that for every breakdown. Principal is never
read, and candidates and not-a-fee records are dropped before any aggregate.

### 2.2 Attribution
GST-on-fee rows, reversals and refunds that link to a fee roll up under that fee's
type, account and provider. So a reversal reduces the family it actually gave back:
a minimum-balance charge reversed in full nets to zero in *Minimum balance*, not in
"Other". Each record is bucketed by its own date, so a reversal lands in the month
the money came back.

### 2.3 Filter semantics
* The period applies to the hero, the breakdowns and Recent.
* The trend and the month-over-month comparison ignore the period, since they are
  fixed windows, but respect the account, type and provider filters.
* The review count ignores all filters: it is about what still needs a decision.
* "Source" in the ticket is interpreted as **provider / institution**, because account or card is
  already its own filter.
* "Year" means the calendar year.

### 2.4 Performance
Grouping is a single O(n) pass, run in `useMemo` over records that
`useFeeIntelligence` already computes off the render path. 20,000 records build
in well under the 1.5 s test budget under Node. The overview is one `ScrollView`
of bounded content: at most 6 rows per breakdown and 10 recent fees.

### 2.5 Charts
There is no new chart component; I reused `components/charts/BarChart`. The trend
is a single series, so it has no legend: the section title names it. Following
the dataviz rules, labels use text tokens, not the series colour, and the
breakdowns are ranked lists with proportion bars rather than a categorical chart.

## 3. Files

| File | What |
|---|---|
| `shared/utils/feeDashboard.ts` (+test, 14) | Periods, attribution, filters, totals, trend, breakdowns, recent, options |
| `components/fees/FeeOverview.tsx` | Overview tab UI and filter sheet |
| `app/(app)/fees.tsx` | Overview tab (now the default) |
| `components/fees/FeeInsightsEntryCard.tsx` | Adds this month's cost |

## 4. Tests and validation

* `npm test`: 296 files / 4741 tests.
* `typecheck` and `typecheck:shared` are clean.
* Dashboard tests cover:
  * period ranges, including year boundaries;
  * attribution;
  * fee / GST / interest separation;
  * every breakdown and the trend reconciling with the headline and with `feeComponentTotals`;
  * reversal netting inside its family;
  * the month-over-month comparison;
  * each filter dimension and the filter options;
  * the first-time user;
  * a 20,000-record timing run.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Seed the fees from the 315 guide, then open Insights. The card should show "₹… this month".
2. Open Fees & charges: it should land on **Overview**. Check that Fees + GST − Reversed matches the hero.
3. Switch between the period chips. Open **Filters**, pick one card, and check that every section narrows while the review banner count stays the same.
4. Tap a trend bar to see its value. Tap a recent fee to open the review sheet.
5. Mark every fee as not a fee. Overview should show the empty state.
