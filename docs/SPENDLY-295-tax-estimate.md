# SPENDLY-295: Tax calculation engine and old-vs-new regime comparison

**Epic:** SPENDLY-288 ([tracker](SPENDLY-288-tax-itr-readiness.md), [plan](SPENDLY-288-plan.md) §9).

**Branch:** `feature/SPENDLY-295-tax-calculation`, from the epic branch.

**Invariant:** an estimate is informational and traceable. The same inputs and rules always give the same result. Every figure names its basis and rule version. Spendly never shows a number when it can't estimate the case or a counted figure is unknown.

## What the user sees

**Tax center → Tax estimate (`/tax/{fy}/estimate`)**
- **Disclaimer:** "An estimate from the figures in Spendly, not your final tax or refund, and not advice." Every result is labelled "Informational estimate".
- **Estimated for:** residential status and age band, with a sheet to set them (`taxProfiles/{fy}`, an age band and never a date of birth).
- **Two cards, new and old regime:** estimated tax, then still to pay or refund (after TDS and tax paid), and a status:
  - informational estimate;
  - with items to check;
  - can't estimate yet;
  - can't estimate this case.
- **Comparison sentence**, never a recommendation: "On these figures, the new regime gives ₹X less estimated tax. Whether you can choose it, and which suits you, depends on your situation."
- **To check / Why there's no estimate:** each gap in plain words, linking to the screen that fixes it (income, TDS, deductions, capital gains, profile).
- **How it's worked out:** every step for the chosen regime, with its basis (section, cap, rate).
- **What Spendly assumed:** for example "Home-loan interest is for a home you live in", or "No interest for late or short advance tax (s.234A/B/C) is included".
- **Footer:** the rule version and its official sources, with the date each was checked.

## Rules (`shared/features/tax/data/taxRules/`)

- **One rule set per year.** It is data only, with a `ruleVersion`, effective dates and cited sources. The engine holds no rates.
- **FY 2025-26 (AY 2026-27)** is `ITA1961-FY2025-26-r1`, checked on 2026-11-07. Each figure and its source is listed in `fy2025_26.ts`:
  - incometax.gov.in, "Salaried Individuals for AY 2026-27": slabs, s.87A, surcharge with the 15% cap on capital gains and dividends, cess, and deduction limits;
  - CBDT ITR-2 validation rules for AY 2026-27: 111A at 20%, LTCG at 12.5%, the rebate limits, and professional tax up to ₹5,000;
  - incometaxindia.gov.in s.112A: 12.5% above ₹1,25,000.
- **Other years** have no rules, so no estimate ("The tax rules for this year aren't in Spendly yet"). FY 2026-27 under the Income-tax Act 2025 is added only once its figures are checked (plan D2). FY 2024-25 isn't supported: its capital-gains rates changed mid-year.
- **A correction is a new rule set** with a new version. Stored snapshots keep the version they used.

## Engine

**`assembleTaxInput` (`utils/taxInput.ts`)** gathers the counted figures, each with a trace of where it came from:
- **Salary:** gross salary from Form 16 plus salary or pension the user added (bank salary credits are never used), with exempt allowances and professional tax.
- **Rent, interest, dividends and other income** from the income screen.
- **Deductions:** confirmed claims only. Claims still waiting on an eligibility check are listed, not counted, so tax is never understated by an unconfirmed claim.
- **Capital gains** by tax treatment:
  - equity short-term → s.111A;
  - equity long-term → s.112A;
  - other long-term → s.112;
  - other short-term → slab.
- **Tax paid:** TDS from Form 16 and certificates, plus advance, self-assessment and other payments.

**Gaps**

| Kind | Effect | Cases |
|---|---|---|
| Unsupported | No estimate | Non-resident or RNOR; business or professional income; a capital gain entered as income; virtual digital assets; long-term gains on land or buildings bought before 23 Jul 2024 (20%-with-indexation choice); capital losses set off across kinds of gain; surcharge with capital gains above ₹50 lakh; surcharge on dividends above ₹2 crore |
| Missing | No estimate | Income months not loaded; a counted income, deduction or sale with no amount, cost or term |
| Pending | Estimate shown as partial, with the items listed | Profile not set (estimated as resident and below 60); income or sales to confirm; claims to confirm; possible double counts; sales to check |

**`computeTax(input, rules, regime)` (`utils/computeTax.ts`)** is pure. In order:
1. **Salary:** exemptions (old regime), the standard deduction, and professional tax (old regime).
2. **House property:** rent less 30%. In the old regime, less home-loan interest up to ₹2,00,000, treated as a self-occupied home (stated).
3. **Other sources** and short-term gains taxed at slab rates.
4. **Deductions** by section and cap, limited to slab-rate income:
   - old regime: 80C/80CCC/80CCD(1) together up to ₹1,50,000; 80CCD(1B), 80D, 80DDB, 80E, 80EEB, 80GG, 80G, 80U/80DD, and 80TTA/80TTB by age;
   - new regime: 80CCD(2) only.
5. **Total income** rounded to ₹10 (s.288A).
6. **Unused basic exemption** reduces special-rate gains, highest rate first.
7. **Tax:** slabs, plus 20% (s.111A), 12.5% (s.112), and 12.5% above ₹1,25,000 (s.112A).
8. **Rebate (s.87A):**
   - new regime: up to ₹60,000 when total income is ₹12 lakh or less, with marginal relief above that, never against special-rate tax;
   - old regime: up to ₹12,500 at ₹5 lakh or less, not against s.112A tax.
9. **Surcharge** with marginal relief, then 4% cess, rounded to ₹10 (s.288B).
10. **Less tax paid:** the balance to pay, or the refund.

**`compareRegimes`** runs both regimes on the same input. `estimateSnapshotPayload` gives what a snapshot stores: the rule version, an FNV-1a hash of the canonical input, the outputs and the unresolved count. Snapshots are written by 296 ("marked reviewed") and 710 ("export"), not here.

## Read model (READ_MODEL_RULES)

- **No new collection or field.**
- **Reads:** the estimate reads through the existing hooks and their read switches (income, deductions, capital gains, profile), only while the screen is open.
- **Writes:** the only write is the profile, through `saveTaxProfile` → `commitMutations` (already dual-written, SPENDLY-709).
- **SQL never computes a displayed number.** The engine is TypeScript over the resolved figures.

## Tests

| File | Covers |
|---|---|
| `computeTax.test.ts` | Slab arithmetic; rounding half up; worked examples (new-regime rebate at ₹12,75,000 salary; marginal relief at ₹12,10,000; ₹20 lakh salary with Form 16 exemptions, 80C cap, 80D cap, 80CCD(1B) and TDS → old ₹3,11,220 vs new ₹1,92,400 refund ₹7,600; equity gains with the ₹1.25 lakh exemption and rebate only on slab tax; unused basic exemption against s.111A in both regimes; old-regime rebate edge at ₹5,00,000 / ₹5,00,010; surcharge and its marginal relief just above ₹50 lakh; house property with interest; 80TTA/80TTB; senior slabs); no figure for unsupported, missing or unverified years; partial with items; refused surcharge cases; stated assumptions; determinism and the input hash; rule version carried into the snapshot payload; sources cited |
| `taxInput.test.ts` | Form 16 salary, exemptions and TDS with traces; income by treatment; unconfirmed claims left out; capital gains by treatment (including s.50AA); unsupported cases (VDA, property indexation, business, non-resident); loss set-off refused, losses alone left out; unknown cost and unloaded ledger; unknown profile and salary twice; payments by type; end to end in both regimes |
| `estimatePresentation.test.ts` | "Informational estimate" on every status; comparison without recommendation; gap wording and where to fix |
| navigation and route-restoration tests | `/tax/{fy}/estimate` |

**Worked examples:** the expected figures were worked out by hand from the cited rules, with the arithmetic in the test comments. They were not run through the department's online calculator, which needs a login.

## Not in this story

- Writing snapshots (296, 710).
- Interest under s.234A/B/C (stated as an assumption).
- Agricultural income, foreign assets and losses carried forward from earlier years (not tracked; not added to the gaps either, since Spendly holds no such data).
