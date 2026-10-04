# SPENDLY-313 — Fee and charge taxonomy, data model and provenance

**Ticket:** [SPENDLY-313](https://kesavach.atlassian.net/browse/SPENDLY-313) (Story)
**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) Fee & Charges Intelligence — see [epic record](SPENDLY-312-fee-charges-intelligence.md)
**Integration branch:** `feature/SPENDLY-312-fee-charges-intelligence` (story branch `feature/SPENDLY-313-fee-taxonomy-model`)
**Baseline:** `origin/main` @ `20cf3be`
**Scope:** Spendly only. Model, taxonomy, rules. No UI, no detection rules, no writes from the app yet.

---

## 1. Context

Nothing fee-shaped existed. The category taxonomy already has fee
subcategories (`bank_charges`, `credit_card_fees`, `atm_fees`, `loan_fees`,
`financial_service_fees`, `investment_fees`, `fines_penalties`) and GST/interest
ones (`gst_other_tax`, `interest`), and `PortfolioTransaction.fees` exists, but
no type describes a fee, and a category alone cannot say that ₹1,030 is ₹1,000
of purchase plus ₹30 of convenience fee and GST.

## 2. Design

### 2.1 A fee is a reading of a ledger row, not a new row

Detected fees are derived at runtime (`FeeInference`, SPENDLY-314) and never
stored. The only persisted fee document is the user's decision,
`FeeReview`. Storing inferences would create a second financial ledger that
drifts from the first the moment a transaction is edited — the exact failure
the epic's "ledger remains canonical" rule exists to prevent.

### 2.2 Components partition the source amount

Every classification carries `components: { principal, fee, tax, interest }`
that must sum to the source transaction's amount (to the paisa). A rupee is
therefore principal *or* fee *or* tax *or* interest — never two — which is the
structural guarantee against counting a fee as spending as well
(`validateFeeClassification`, `feeComponentTotals` never reads `principal`).

### 2.3 GST-on-fee is a component or a linked `tax_on_fee`, never a second fee

GST folded into the same debit is `components.tax`. GST posted as its own debit
gets role `tax_on_fee`, must carry `linkedTo` (validation), and only counts
while that link points at a counted `fee` record (`reconcileFeeLinks` →
`uncertain / broken_link` otherwise). It always lands in the tax column, so it
can never inflate the fee figure. Interest has its own role and column for the
same reason.

### 2.4 Lifecycle and precedence

`inferred` (≥ 0.8 confidence), `uncertain` (≥ 0.4, or conflicting, or source
changed, or broken link), `confirmed`, `user_corrected`. Below 0.4 there is no
record. `uncertain` never counts toward a total (epic principle 1).

A review wins outright over any inference. The one exception: if the source
amount changed after a confirm/correct review, the record drops to
`uncertain / source_changed` — the user's split no longer adds up, so it is
neither counted nor silently replaced. A "not a fee" decision survives amount
edits because there is nothing to go stale.

### 2.5 Provenance

Every record carries `evidence[]` (signal kind, stable rule id, masked display
text, weight) and `provenance` (rule vs user, engine version, rule ids, review
id/revision/time). A review snapshots what the engine said when the user acted
(`inferredRole/FeeType/Confidence`, `engineVersion`) and increments `revision`
on every write — SPENDLY-315's correction history keys off it.

### 2.6 Firestore: `users/{uid}/feeReviews/{kind}__{id}`

A dedicated validated match, not the catch-all allowlist:

* owner-only (incl. the `_duress` twin), like every personal collection;
* doc id must equal `sourceKind + '__' + sourceId` of its own body — at most one
  review per transaction;
* `hasOnly` field allowlist, which also refuses `amount`/`date`: a review can
  never look like money;
* closed enums for kind, decision, role, fee type (mirrored from TS and pinned
  by `feeModel.rules.contract.test.ts`);
* source identity and `createdAtMs` pinned on update; `revision` must advance.

No index is needed (single-collection list by owner). `firestore.indexes.json`
is untouched — see the index-drift note before any index deploy.

### 2.7 Out of scope (left for their stories)

Detection rules and keywords (314), the write service and review UI (315),
aggregation by month/type/source (316), masking helpers for evidence text
(317). `feeTaxonomy.categoryKeys` is the hook 314 uses to read categories.

## 3. Files

| File | What |
|---|---|
| `shared/types/fee.ts` | Types, id lists, roles, statuses, components, evidence, inference, review, record |
| `shared/data/feeTaxonomy.ts` | 15 India-first fee types with subtypes, labels, category links |
| `shared/utils/feeModel.ts` | Doc ids, component math, validation, resolution, link reconciliation, totals, review builder |
| `firestore.rules` | `feeReviewWellFormed` + `match /feeReviews/{reviewId}` |
| `*.test.ts` | See §4 |

## 4. Tests

* `shared/data/feeTaxonomy.test.ts` (7) — coverage of the epic's families, id hygiene, category links exist and never point at principal categories.
* `shared/utils/feeModel.test.ts` (36) — partitioning, GST folded vs linked, interest separation, direction, precedence (confirm / correct / not-a-fee / stale), link integrity, totals across a mixed history, duplicate suppression, review building.
* `shared/utils/feeModel.rules.contract.test.ts` (4) — rules enums ≡ TS.
* `firestore/feeReviews.rules.test.ts` (11, emulator) — owner CRUD, duress, cross-user and anonymous denial, doc-id binding, money-field refusal, enums, component shape, ranges, revision/identity pinning.

Results: `npm test` 293 files / 4636 tests; `npm run test:rules` 16 files / 476 tests; `npm run typecheck` and `typecheck:shared` clean. No lint script exists in the repo.

## 5. Manual verification

Nothing user-visible ships in this story. After merge, the rules change needs
the normal manual deploy (`docs/FIREBASE_RULES_DEPLOY.md`); until then the app
has no code path that writes `feeReviews`, so nothing breaks either way.

## 6. Ticket hygiene

Jira: In Progress. Moves to Done when the epic reaches `main`, per project convention.
