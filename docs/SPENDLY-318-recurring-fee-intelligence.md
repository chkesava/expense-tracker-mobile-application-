# SPENDLY-318 — Recurring and fee-pattern intelligence

**Ticket:** [SPENDLY-318](https://kesavach.atlassian.net/browse/SPENDLY-318) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-318-recurring-fee-intelligence`, cut from the epic branch after 317.
**Depends on:** 313 (totals), 314 (records), 316 (attribution, overview), 317 (detail)
**Scope:** Spendly only. No rules, index or data-model changes.

---

## 1. What users see

The Overview tab has a new **Repeating fees** section, placed between the
breakdowns and Recent fees. It shows up to 5 patterns. Each row shows:

* the fee type and where it is charged;
* whether it is a *Regular monthly / quarterly / yearly charge* or a *Repeated charge*;
* how many times it has been charged, and since when;
* "may have stopped", when that applies;
* a trend icon;
* `~₹X/yr`.

Tapping a row opens a sheet with:

* the plain-language signals;
* **Estimated per year**, with the sentence explaining what it was computed from, plus the total so far;
* every transaction behind the pattern. Tapping one opens its fee detail.

## 2. Design

### 2.1 Grouping
Patterns group counted records by fee family and where the fee is charged: the
account, or the provider when there is no account. GST rows and reversals that
belong to one of the fees are included through the 316 attribution. The cost of
a pattern is `feeComponentTotals` over the group, the same sum the overview
uses, so a pattern's total is fees + GST − reversals.

### 2.2 Sufficient evidence
A pattern needs one of the following:

* at least **3 charges across at least 2 months**; or
* **2 charges about a year apart** (330–400 days) with a steady amount. This covers an annual card fee.

Three ATM charges in a single month is not a pattern yet. Candidates and
not-a-fee records never count.

### 2.3 Regular vs repeated
* **Cadence** comes from the median gap between charges, with at least 75% of gaps inside the band:
  * monthly: 25–35 days;
  * quarterly: 80–100 days;
  * yearly: 330–400 days;
  * anything else: irregular.
* **Amount** is steady when the charge amounts' coefficient of variation is ≤ 10%.
* A pattern is labelled "Regular …" **only** when both the cadence and the amount are steady. Everything else is labelled "Repeated charge". Nothing is ever presented as a subscription.

### 2.4 Estimates are labelled, always
* **Yearly cadence:** the typical charge. Basis text: "one charge a year of about the usual amount, from N charges since …".
* **12 or more months of history:** the cost over the last 12 months.
* **Shorter history:** the cost scaled to a year, over at least 3 months. The basis text says so and notes that the figure will change.

The basis sentence is shown right next to the number wherever it appears.

### 2.5 Trend and change
* **Trend** compares the cost of the last 3 months with the 3 months before: rising or falling beyond ±20%, *new* if it first appeared within the last 3 months, *stopped* if there has been nothing in the last 3 months.
* **"May have stopped"** means no charge for longer than 2× the usual gap (and at least 45 days).
* **Charge counts** for the last 90 days and the 90 days before are kept on each pattern, ready for SPENDLY-322.

### 2.6 No advice
The signals and basis text only describe the user's own history. A test checks
they never contain words like "switch", "recommend", "better", "cheaper",
"best" or "should". Patterns are ordered by the user's own estimated yearly
cost, not by provider.

### 2.7 Filters
Patterns use the whole history, because a pattern needs it. The account, type
and provider filters apply; the period filter does not.

## 3. Files

| File | What |
|---|---|
| `shared/utils/feePatterns.ts` (+test, 12) | Grouping, evidence gate, cadence, amount stability, estimate + basis, trend, stop signal, signals |
| `components/fees/FeePatternsSection.tsx` | Overview section and pattern sheet |
| `components/fees/FeeOverview.tsx` | Renders the section |

## 4. Tests and validation

* `npm test`: 298 files / 4762 tests.
* `typecheck` and `typecheck:shared` are clean.
* 20,000 records are grouped in about 0.3 s under Node.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Add `NON MAINT CHGS` ₹590 on the last day of each of 4 or more months on one bank account.
2. Add `ATM WDL CHG` on irregular dates, with varying amounts, over 3 months.
3. Open Fees → Overview → **Repeating fees**. The minimum-balance row should read *Regular monthly charge*, and the ATM row *Repeated charge*.
4. Open a pattern. Check the "Estimate: …" sentence under the yearly figure, and that every seeded transaction is listed. Tap one to open its fee detail.
5. Filter to a different account. The patterns should disappear.
