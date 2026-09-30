# SPENDLY-314 — Fee detection and transaction classification engine

**Ticket:** [SPENDLY-314](https://kesavach.atlassian.net/browse/SPENDLY-314) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Integration branch:** `feature/SPENDLY-312-fee-charges-intelligence` (story branch `feature/SPENDLY-314-fee-detection`)
**Depends on:** SPENDLY-313 (model, `resolveFeeRecord`, `reconcileFeeLinks`)
**Scope:** Spendly only. Pure engine in `shared/utils/feeDetection.ts`; no UI, no Firestore writes, no provider wiring.

---

## 1. Context

Fee charges already sit in the ledger — bank SMS narrations ("NON MAINT CHGS",
"ATM WDL CHG") land in `Expense.note`, and some users file them under the
taxonomy's fee subcategories — but nothing recognised them. This story reads
them without any bank integration.

## 2. Design

### 2.1 Inputs and adapters

`expenses` (debits), `incomes` (credits) and manual `accountEntries`
(either direction) are adapted into `FeeSourceSnapshot`s. Soft-deleted rows,
split postings and investment-cash transfers are skipped: they are movements,
never charges. Transfers, card payments and borrowings are not inputs at all.

### 2.2 Signals and scoring

Keywords read the **note only**; category is a separate signal so a row filed
under "ATM Fees" is not double-counted as saying "ATM fees".

| Signal | Weight | Notes |
|---|---|---|
| Keyword rule | 0.85 unmistakable, 0.8 specific, 0.65–0.7 needs context | ~55 India-first rules; the first match sets type/subtype, all matches become evidence |
| Account context | +0.15 match, −0.2 mismatch | credit card vs bank via `accountTypeId`, else `creditLimit`/`billGenerationDay` |
| Fee category | 0.8 alone, +0.1 with a keyword | `atm_fees`, `credit_card_fees`, `loan_fees`, `investment_fees`, `bank_charges`, `financial_service_fees` |
| Principal category | −0.35 | card payment, EMIs, insurance, income tax, school/college fees |
| Purchase category | −0.25 | any parent other than finance, investments or Miscellaneous |
| Large amount | −0.25 over ₹25,000; nothing over ₹1,00,000 | |

Education is excluded outright. Bare "fee"/"charge" is never enough, and an
ATM *withdrawal* (no charge word) is never a fee.

Context refines type: an "annual fee" on a bank account is a debit-card fee;
ATM/cash charges on a credit card are a cash advance.

### 2.3 Interest and GST have their own roles

* Finance charges / interest debits → role `interest`, only when no fee phrase
  claims the row.
* GST as the subject of the narration ("IGST ON ATM CHG") → role `tax_on_fee`,
  paired with a fee on the same account within ±3 days whose fee part × 18%
  matches to 2 paise. Unpaired GST stays a candidate.
* "incl GST" → one fee record split at the standard 18%, **always uncertain**:
  the narration says GST is inside but not how much, so the user confirms.
* GST on a purchase (no fee phrase) is ignored.

### 2.4 Reversal / refund pairing

A credit is considered only if it has a reversal word **and** a charge
phrase — merchant refunds are never ours. It pairs one-to-one, oldest credit
first, with a fee on the same account up to 90 days earlier whose whole amount
(or fee part) matches. Mismatched fee families don't pair. Fees the user already
linked, or marked "not a fee", are not eligible. Unpaired credits stay
`uncertain` and reduce nothing — SPENDLY-319 refines this further.

### 2.5 Corrections always win

Reviews are fed into the same pass: they set the pairing pool (user decisions
first), reviewed rows skip re-pairing, and every row goes through
`resolveFeeRecord`, so a correction applies on every recalculation — cached or
not — and also to rows the engine never detected.

### 2.6 Explainability and privacy

Every record carries evidence with a stable `ruleId`, a short quoted phrase and
a weight. Any run of 5+ digits in the note or evidence is masked to its last
four (`maskSensitiveDigits`).

### 2.7 Incremental and fast

Per-row classification depends only on the row and its account, and is cached
by content signature (amount, date, note, category, account type, engine
version). A re-run re-reads only changed rows; deleted rows are pruned. The
pairing pool is indexed by amount in paise. On 20,500 synthetic rows the
cold + warm runs together take ~0.9 s under Node; the warm run is strictly
faster. Screens must run it off the render path (memo + idle) — that wiring is
SPENDLY-315/316, the first consumers.

### 2.8 Out of scope

Hook/provider wiring and the review UI (315); aggregates (316); duplicate and
unusual-amount signals (319); SMS-parser changes — the engine reads what the
parser already writes.

## 3. Files

| File | What |
|---|---|
| `shared/utils/feeDetection.ts` | Rules, adapters, classification, cache, pairing, `detectFees`, `feeCandidateQueue` |
| `shared/utils/feeDetection.test.ts` | 68 tests |

## 4. Tests

Table-driven narrations for every family on the right account type;
determinism; category-only and v3-label detection; ten look-alike non-fees
(ATM withdrawal, school fees, doctor's fee, card payment, EMI, purchase, GST on
a purchase, bare "charges", huge amounts, merchant refunds, savings interest);
deleted/split/transfer exclusion; ambiguous candidates; context mismatch;
GST-inclusive split; interest vs fee; GST pairing (including cross-account and
window misses); reversal pairing (whole amount, fee + GST, one-to-one, window,
family mismatch, refund); corrections across cached re-runs; masking;
incremental re-classification and pruning; a 20.5k-row timing run.

`npm test` 294 files / 4704 tests; typecheck and shared typecheck clean.

## 5. Known limitations

* Keyword coverage is India-first and English-only; unfamiliar bank
  abbreviations fall through to category detection or are missed. Missing a fee
  is acceptable; the epic does not promise to find every one.
* GST pairing assumes 18%.
* Only expenses, incomes and manual entries are read; fees embedded in
  statement-imported card bills are only seen once imported as expenses.
