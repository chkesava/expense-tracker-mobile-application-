# SPENDLY-205: Financial Runway calculation contract

**Ticket:** [SPENDLY-205](https://kesavach.atlassian.net/browse/SPENDLY-205) (Story)
**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204). See the [epic record](SPENDLY-204-financial-runway.md).
**Branch:** `feature/SPENDLY-205-runway-contract`, cut from the epic branch (from origin/main @ `db813fa`) and merged back with approval.
**Scope:** pure contract only. There is no UI, no Firestore, no rules change, and existing calculations are untouched.

---

## 1. What this contract is
Runway answers: *"Given my current position and assumptions, how long can I keep meeting my expected commitments?"* It is a **planning estimate, never a prediction**.

This story fixes the vocabulary and rules that the rest of the epic uses:
- the engine (206);
- account classification and overrides (207);
- the historical burn baseline (208);
- the Calendar projection (209);
- the UI (210).

| File | What |
|---|---|
| `shared/types/runway.ts` | Resource kinds, liquidity, provenance and certainty, burn and income classes, modes, threshold, result states, confidence and assumption codes |
| `shared/data/runwayRules.ts` | Default rules, `RUNWAY_RULES_VERSION = 1` |
| `shared/utils/runwayContract.ts` | Pure classification functions and formulas |
| `shared/utils/runwayContract.test.ts` | 30 tests |

Calculating runway never creates, edits or deletes a record. Everything is derived from canonical Spendly data that callers pass in.

## 2. Resources: liquid vs not
These are product decisions made on 2026-10-02.

| Kind | Source | Default liquidity | Counted? |
|---|---|---|---|
| bank, cash, wallet | `accounts` | liquid | **Yes** |
| other_account (type not recognised) | `accounts` | unknown | No: it could be an FD, broker or loan account |
| fixed_deposit, interest_savings, mutual_fund | `investments` | near-liquid | No: shown, and the user can opt in (207) |
| demat_cash | portfolio cash ledger | near-liquid | No: opt in |
| stocks, epf | holdings, EPF | restricted | No |
| receivable | `receivables` | expected inflow | No: never cash until received |
| credit_card, borrowing | `accounts`, `borrowings` | obligation | No: never a resource |

**How the rules are applied:**
- An account's kind comes from the app's **existing** classifier: the stored `accountTypeId`, otherwise `canonicalAccountTypeId(typeName)` in `accountKind.ts`. There's no new name guessing.
- An included resource that's overdrawn counts as **negative** (reason `overdrawn_counted`). Being overdrawn reduces runway.
- **Currency:** only the display currency (`settings.currency`) counts. An account with a different `currency` is excluded (`currency_unsupported`) and lowers confidence. There's no FX conversion.
- Every resource carries `reasons[]` and `provenance { source, refId, asOf, certainty }`, so the included total reconciles with its sources (`liquidTotal`).

## 3. Spending: burn classes
Each expense's stored category names resolve to a v4 taxonomy key:
- **exact:** the current names match directly;
- **mapped:** older names go through the app's own `collapseToCurrentTaxonomy`, with no guessing from the note;
- **unresolved:** anything else counts as discretionary and is flagged.

If the parent matches but the subcategory doesn't, the parent's class is used.

| Class | Examples | Net burn | Gross (essential) burn |
|---|---|---|---|
| essential | groceries, rent, utilities, health, education, insurance, taxes | ✓ | ✓ |
| discretionary | dining out, shopping, entertainment, travel, misc | ✓ | – |
| savings_contribution | the whole Investments & Savings parent (SIP, FD, RD, PPF, emergency fund) | ✓ | – (pausable) |
| debt_service | EMIs, interest | ✓ | ✓ |
| fee | bank, card, ATM, loan, investment fees | ✓ | ✓ |
| money_movement | Credit Card Payment, Transfer | **never** | **never** |

**Notes:**
- Credit Card Payment is excluded because the card spending is already recorded as expenses; counting the payment too would double count it. Bill payments recorded as `AccountPayment` are not expenses at all.
- The full mapping, with a reason for each entry, is in `BURN_CLASS_BY_PARENT` / `BURN_CLASS_BY_SUBCATEGORY`.
- Tests fail if a visible taxonomy parent has no rule or an override names a pair that doesn't exist.

## 4. Income: actual vs expected
- **Recorded income is always actual.** Projected income (206/209) must carry `certainty: "expected"` or `"estimated"`. `isActualIncome` keeps the two apart.
- **earned:** Salary, Bonus, Freelance, Business, Rental, Interest, Dividend, Gift, Pension, Government Benefit, Other.
- **refund_offset:** Refund, Cashback, Reimbursement. This is money returning for spending already recorded; it offsets outflow and is never counted as income.
- **asset_conversion:** Investment Proceeds. Selling an asset is not recurring income.
- An unrecognised source is treated as earned and flagged (`income_source_unrecognised`).

## 5. Formulas
The **floor** is the reserve threshold:
- `none` → 0;
- `amount` → that amount (minimum 0);
- `essential_months` → months × monthly essential outflow. If that outflow is unknown, the floor is unknown.

| Mode | Formula |
|---|---|
| Net burn | (liquid − floor) ÷ (monthly outflow − monthly earned income) |
| Gross (essential) burn | (liquid − floor) ÷ monthly essential outflow. Income is ignored |
| Commitment-aware projection (206/209) | Month by month: opening + expected inflows − expected outflows − known commitments. Runway ends at the **first period whose closing balance is below the floor** (`firstPeriodBelowFloor`) |

Every result has a `state` and the mode label (`RUNWAY_MODE_INFO`, so the UI can say which mode is in use):

| State | When | Months |
|---|---|---|
| `finite` | Burn > 0 and liquid money is above the floor | Rounded to 1 decimal |
| `not_depleting` | Burn ≤ 0, so inflows cover outflows | null |
| `already_below` | Liquid money is at or below the floor | 0 |
| `insufficient_data` | Any input is missing or not finite | null; no number is shown |

The projection horizon is 1–24 whole months, default 12. Every function is deterministic: `today` is always passed in as a local date key in `settings.timezone`, and nothing reads the clock.

## 6. Missing and uncertain data
`deriveConfidence` grades in this order:
1. **insufficient:** no full month of history, or no counted liquid resource.
2. **low:** under 3 months of history, an unknown account kind, or a currency that isn't supported.
3. **medium:** under 6 months of history, uncertain commitments, or categories that couldn't be resolved.
4. **high:** none of the above.

Each reason maps to user-facing text in `RUNWAY_ASSUMPTIONS`. `validateRunwayInputs` rejects:
- a bad `today`;
- a missing currency or timezone;
- an unknown mode;
- a negative threshold;
- a horizon outside 1–24.

## 7. Acceptance criteria → tests
| Criterion | Covered by |
|---|---|
| Every input has documented inclusion/exclusion rules | §2–§4, plus the "has a rule for every kind / parent / income source" tests |
| EPF and restricted assets are not silently liquid | "never silently counts EPF, stocks, FD…" |
| Actual and projected values are distinguishable | `certainty` in provenance; "separates actual from expected values" |
| Runway modes have documented formulas | §5, `RUNWAY_MODE_INFO`, plus the formula tests |
| Input provenance is traceable | `reasons` and `provenance` on every resource; "reconciles with the source balance" |
| Missing or uncertain data has defined behaviour | `insufficient_data` state, `deriveConfidence`, and the unresolved-category, unknown-kind and currency tests |
| Contract is independently testable | Pure functions with no Firebase or clock; 30 vitest tests |

## 8. Validation
- `npm test` passes, including `runwayContract.test.ts` (30 tests).
- `typecheck:shared` and `typecheck` are clean.
- There's no UI, so there's nothing to check on a device.
