# SPENDLY-312 — Fee & Charges Intelligence

**Epic:** [SPENDLY-312](https://kesavach.atlassian.net/browse/SPENDLY-312) — *Fee & Charges Intelligence — Financial Cost Visibility & Optimization*
**Integration branch:** `feature/SPENDLY-312-fee-charges-intelligence`, cut from `origin/main` @ `20cf3be` (no `dev` branch exists). Story branches `feature/SPENDLY-3xx-<slug>` are cut from it and merged back `--no-ff`. The epic merges to `main` only when every story is done, and only when asked.
**Scope:** Spendly only. No Ganesh Seva or Nutrition surface is touched.
**Jira status rule:** stories stay **In Progress** (with a comment naming the epic-branch merge) until the epic reaches `main`, then go **Done**.

---

## 1. Architecture in one paragraph

The Spendly ledger stays canonical. A fee is never a new money row: it is a
*reading* of an existing transaction that says how its amount divides into
principal / fee / tax-on-fee / interest. The detection engine derives
`FeeInference`s at runtime from data already loaded by `FinanceDataProvider`;
the only fee document persisted is the user's `FeeReview`
(`users/{uid}/feeReviews/{kind}__{id}`, one per transaction by construction).
`resolveFeeRecord` folds the two — review always wins — and
`feeComponentTotals` is the single sum every fee surface must reconcile to.
Original transactions are never modified.

## 2. Story map and dependency order

Jira carries no issue links between the stories; the order below is derived
from each story's scope and acceptance criteria.

| Order | Story | Summary | Depends on | State |
|---|---|---|---|---|
| 1 | [SPENDLY-313](https://kesavach.atlassian.net/browse/SPENDLY-313) | Taxonomy, data model, provenance | — | Merged to epic |
| 2 | [SPENDLY-314](https://kesavach.atlassian.net/browse/SPENDLY-314) | Detection & classification engine | 313 | Merged to epic |
| 3 | [SPENDLY-315](https://kesavach.atlassian.net/browse/SPENDLY-315) | Review, confirmation & correction flow | 314 | Merged to epic |
| 4 | [SPENDLY-316](https://kesavach.atlassian.net/browse/SPENDLY-316) | Dashboard & cost overview | 314, 315 | Merged to epic |
| 5 | [SPENDLY-317](https://kesavach.atlassian.net/browse/SPENDLY-317) | Fee detail, evidence & linkage | 314, 315 | Merged to epic |
| 6 | [SPENDLY-318](https://kesavach.atlassian.net/browse/SPENDLY-318) | Recurring & fee-pattern intelligence | 314 | Merged to epic |
| 7 | [SPENDLY-319](https://kesavach.atlassian.net/browse/SPENDLY-319) | Anomaly, duplicate & reversal intelligence | 314, 315 | Merged to epic |
| — | SPENDLY-320 | Financial Calendar integration | **SPENDLY-176** (all of 177–185 To Do) | On hold (user decision 2026-09-29) until SPENDLY-176 lands |
| — | SPENDLY-321 | Fee alerts & notification preferences | **SPENDLY-222** (esp. 224, 226, 230; all To Do) | On hold (user decision 2026-09-29) until SPENDLY-222 lands |
| 8 | [SPENDLY-322](https://kesavach.atlassian.net/browse/SPENDLY-322) | Insights & cost-control prompts | 316, 318, 319 | Committed on story branch, awaiting merge approval |
| 9 | SPENDLY-323 | QA, accuracy, privacy, performance, rollout | all | To Do — calendar/notification AC need 320/321 |

**Blockers.** No Financial Calendar code exists, and 320's AC forbid a
second calendar. Only local `expo-notifications` exists (bill reminders, SMS);
321's AC require the SPENDLY-222 infrastructure. Neither is started.

## 3. Per-story records

* [SPENDLY-313](SPENDLY-313-fee-taxonomy-model.md)
* [SPENDLY-314](SPENDLY-314-fee-detection.md)
* [SPENDLY-315](SPENDLY-315-fee-review-correction.md)
* [SPENDLY-316](SPENDLY-316-fee-dashboard.md)
* [SPENDLY-317](SPENDLY-317-fee-detail.md)
* [SPENDLY-318](SPENDLY-318-recurring-fee-intelligence.md)
* [SPENDLY-319](SPENDLY-319-fee-anomaly-reversal.md)
* [SPENDLY-322](SPENDLY-322-fee-insights.md)
