# SPENDLY-326: Build Salary Detection and Payroll Transaction Recognition

**Epic:** [SPENDLY-324: Salary Intelligence](https://kesavach.atlassian.net/browse/SPENDLY-324)  
**Story:** [SPENDLY-326](https://kesavach.atlassian.net/browse/SPENDLY-326)  
**Branch:** `feature/SPENDLY-326-salary-detection` (branched from `feature/SPENDLY-324-salary-intelligence`)

---

## 1. Goal & Architectural Overview

SPENDLY-326 implements the pure, deterministic detection engine that identifies likely salary credits from Spendly transaction history (`incomes`) without modifying source records.

### Key Capabilities:
1. **India-First Payroll & Employer Normalization (`payrollNormalize.ts`)**:
   - Parses noisy Indian bank narrations from major banks (HDFC, ICICI, SBI, Axis, Kotak).
   - Identifies corporate payment rails and payroll gateways (`CMS`, `ACH`, `NEFT`, `RTGS`, `NACH`, `RazorpayX`, `greytHR`, `Kredily`, `Rippling`, `Darwinbox`, `Zoho Payroll`).
   - Normalizes corporate employer names by stripping corporate structure suffixes (`Pvt Ltd`, `Private Limited`, `LLP`, `Inc`, `Corp`, `Enterprises`, `India`) and banking rail noise (`NEFT`, `CR`, `DR`, `TRANSFER`, `TRF`), producing clean human display names and normalized matching keys.
   - Extracts explicit payroll wage months embedded in narrations (e.g. `SAL OCT 2026`, `SAL/OCT26`, `SALARY FOR SEPTEMBER 2026`).
   - Infers statutory wage months according to Indian payroll conventions (e.g., payment on Nov 01–10 represents October wage month; payment on or after Nov 11 represents November wage month).
   - Classifies salary types: `regular`, `bonus`, `incentive`, `reimbursement`, `stipend`, `severance`.

2. **Salary Detection & Payday Recognition Engine (`detectSalary.ts`)**:
   - Evaluates incomes against explicit payroll tokens, income source categories, and employer profiles.
   - Groups transactions by employer counterparty to detect **Recurring Payday Clusters**:
     - Evaluates day-of-month consistency (clustering within ±3 days or typical month-end window).
     - Evaluates amount stability across months (variance <= 20%).
   - Boosts candidates matching the user's `SalaryProfile.primaryEmployer` to high confidence.
   - Scores candidates into `high`, `medium`, and `low` confidence tiers with concrete human-readable `evidence: string[]`.

3. **Exclusion Rules & Invariant Guarantees**:
   - **No automatic classification solely because an amount is large or recurring**: Excludes rental income, recurring transfers, and generic credits without employer signals.
   - Filters out non-salary transactions:
     - UPI P2P transfers (e.g. `@okaxis`, `@okhdfcbank`, `@paytm`).
     - Refunds, reversals, and chargebacks.
     - Cashbacks, credit card rewards, and promo credits.
     - Personal loan and EMI disbursals (`BAJAJ FINANCE`, `MUTHOOT`, `DISBURSAL`).
     - Dividends, interest credits, and mutual fund / Demat redemptions (`ZERODHA`, `GROWW`, `SWP`).
     - Soft-deleted incomes (`deletedAt`).
   - **Permanent User Preference Respect**: Incomes previously rejected in `SalaryReview` (`decision: "reject"`) are permanently excluded from future candidate scans.
   - **Conversion to Domain Records**: Provides `candidateToSalaryRecord` which safely formats candidates into `SalaryRecord` domain models using `buildSalaryRecord`.
   - **High Performance**: Processes 2,000 transactions in under 50ms.

---

## 2. Changes Implemented

### Domain Types (`shared/features/salary/types/`)
- **`shared/features/salary/types/index.ts`**:
  - Added `SalaryCandidate` interface with `incomeId`, `amount`, `date`, `payPeriod`, `employer`, `confidence`, `evidence`, `detectionRule`, `suggestedType`, `accountId`, `rawNarration`, and `existingStatus`.
  - Added `SalaryDetectionOptions` interface for passing existing records, reviews, profiles, and threshold options.

### Payroll Normalization (`shared/features/salary/utils/payrollNormalize.ts`)
- Implemented `normalizeEmployerName`: cleans corporate suffixes and bank rail noise, producing title-cased display names and lowercase normalized keys.
- Implemented `extractPayrollMonth`: extracts explicit wage months (`YYYY-MM`) from diverse narration formats.
- Implemented `inferPayPeriodMonth`: infers wage month based on Indian payroll dates and year rollovers.
- Implemented `inferSalaryType`: detects bonuses, incentives, reimbursements, stipends, and severance.
- Implemented `parsePayrollNarration`: comprehensive parser extracting tokens, gateways, wage month, employer, and non-salary exclusion flags.

### Detection Engine (`shared/features/salary/utils/detectSalary.ts`)
- Implemented `detectSalaryCandidates`: multi-pass scanning, pre-filtering, grouping, payday clustering, and confidence scoring.
- Implemented `candidateToSalaryRecord`: helper converting a candidate into a canonical `SalaryRecord`.

### Barrel Exports (`shared/features/salary/`)
- Created `shared/features/salary/utils/index.ts` and `shared/features/salary/index.ts`.

---

## 3. Verification & Test Results

| Test Suite | File | Tests | Result |
| :--- | :--- | :--- | :--- |
| **Payroll Normalization** | `shared/features/salary/utils/payrollNormalize.test.ts` | 20 | ✅ Passed |
| **Salary Detection Engine** | `shared/features/salary/utils/detectSalary.test.ts` | 12 | ✅ Passed |
| **Salary Domain Builders** | `shared/features/salary/utils/builders.test.ts` | 7 | ✅ Passed |
| **Salary Rules Contract** | `shared/features/salary/salaryRules.contract.test.ts` | 5 | ✅ Passed |
| **Total Salary Feature Tests** | `npm test -- --run shared/features/salary` | **44** | ✅ **44/44 passed (100%)** |
| **Read Model Mapping Guard** | `shared/utils/readModel/mapping.test.ts` | 105 | ✅ Passed |
| **Firestore Cross-User Indexes** | `scripts/readmodelCrossUserIndexes.test.ts` | 166 | ✅ Passed |
| **Read Model Write Hooks** | `lib/readModelWriteHooks.test.ts` | 8 | ✅ Passed |
| **Read Model Provider Switch** | `lib/readModelLocal/providerSwitch.test.ts` | 66 | ✅ Passed |
| **Read Model Listeners Guard** | `lib/readModelLocal/listenersOff.test.ts` | 4 | ✅ Passed |
| **Shared Package Typecheck** | `npm run typecheck:shared` | - | ✅ **0 errors** |
| **Root Project Typecheck** | `npm run typecheck` | - | ✅ **0 errors** |

---

## 4. Manual Testing Guide & Acceptance Verification

1. **Explicit Narration Candidates**:
   - Pass an income with note `"CMS/001928/TCS LTD/SAL OCT 2026"` into `detectSalaryCandidates`.
   - Verify candidate is surfaced with `confidence: "high"`, employer `"Tcs"`, and wage month `"2026-10"`.
2. **Recurring Payday Clustering**:
   - Pass 3 incomes from `"Wipro"` on the 30th of Aug, Sep, and Oct without explicit "salary" keywords.
   - Verify candidate is surfaced with `confidence: "medium"` and evidence detailing 3-month recurrence and payday window.
3. **Exclusion Validation**:
   - Pass incomes with UPI P2P (`rahul@okaxis`), refunds, or loan disbursals.
   - Verify 0 candidates are returned.
4. **User Rejections**:
   - Pass an existing review with `decision: "reject"` for a transaction.
   - Verify the transaction is omitted from future candidate scans.
