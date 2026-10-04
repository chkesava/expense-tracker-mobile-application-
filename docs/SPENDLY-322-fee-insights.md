# SPENDLY-322 — Fee insights and cost-control prompts

**Ticket:** [SPENDLY-322](https://kesavach.atlassian.net/browse/SPENDLY-322) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Branch:** `feature/SPENDLY-322-fee-insights`, cut from the epic branch after 319 and merged back with approval.
**Depends on:** 316 (dashboard / attribution), 318 (patterns), 319 (signals)
**Scope:** Spendly only. No rules, index or data-model changes.

---

## 1. What users see

An **Insights** section near the top of the Fees Overview, below the hero. It
holds up to 6 rows. Tapping one opens **How this was worked out** and the
transactions behind it. Each transaction opens its fee detail. Nothing else is
recommended.

| Insight | When shown |
|---|---|
| "You paid ₹X in fees this month" | Any counted fees this month |
| "‹Fee type› was your biggest fee this month" | More than one fee type this month |
| "Most of this month's fees came from ‹provider›" | More than one provider this month |
| "Fees are higher / lower than usual this month" | At least 3 of the previous 6 months have data, and this month differs from the user's own average by 25% or more |
| "N fees keep coming back" | Any live 318 pattern. The yearly total is labelled an estimate |
| "‹Fee type› fees are rising / falling" | A 318 pattern with that trend |
| "About your ‹fee type› charges" | 2 or more charges of ATM, minimum balance, late payment, cash advance, forex or cheque return in the last 6 months |

## 2. Design

### 2.1 Evidence first
Every insight has `recordKeys`, which is never empty and always points to real
records, and a `basis` sentence. Money goes through `feeComponentTotals`, so the
month total matches the Overview hero; a test asserts this. Candidates and
not-a-fee records never appear.

### 2.2 Only your own baseline
The comparison is the user's own average over the previous 6 months, with
months that had no fees counted as zero. It is only shown with at least 3 months
of data. There is no comparison with other users, providers or products. "Most
fees came from X" describes the user's own charges; it is not a ranking of
banks.

### 2.3 "Worth understanding", not "avoidable"
The ticket asks for prompts about possibly avoidable patterns, but forbids
claiming a fee is avoidable. So each prompt puts two things side by side:

* a **fact about the user's data**: "charged 4 times in the last 6 months (₹84)";
* a **general fact about the charge type**: "Banks usually charge this when ATM withdrawals go beyond the free monthly limit…".

The basis sentence says that the second part is general information, not a
statement about the user's account. A test forbids "avoid", "switch",
"recommend", "should", "cheaper", "better", "best" and "cheapest" anywhere in the
insight text.

### 2.4 Estimates disclose their basis
The repeating-fees total is the sum of the 318 per-pattern estimates. Its basis
text starts with "Estimate:" and explains that it will change.

### 2.5 Filters
Insights follow the Overview's account, type and provider filters, but not the
period filter. They always describe this month and recent history.

## 3. Files

| File | What |
|---|---|
| `shared/utils/feeInsights.ts` (+test, 10) | Insight builders |
| `shared/utils/feeDashboard.ts` | `matchesDimensions` is now exported for reuse |
| `components/fees/FeeInsightsSection.tsx` | Section and "how this was worked out" sheet |
| `components/fees/FeeOverview.tsx` | Renders it |

## 4. Tests and validation

* `npm test`: 300 files / 4792 tests.
* `typecheck` and `typecheck:shared` are clean.
* **Not yet checked on a device.**

## 5. Manual testing guide

1. Seed ATM charges in 3 different months, a minimum-balance charge every month since April, and a card annual fee this month.
2. Open Fees → Overview → **Insights**. You should see this month's total, the biggest fee type, the top source, higher than usual, repeating fees and "About your …" rows.
3. Open "You paid ₹X…". The figure should match the hero, the basis text should be shown, and the list should hold exactly this month's charges.
4. Filter to one account. The insights should narrow to it.
