# SPENDLY-195: Financial What-If Simulator (epic tracker)

**Epic:** [SPENDLY-195](https://kesavach.atlassian.net/browse/SPENDLY-195), “Financial What-If Simulator — Scenario Planning & Financial Forecasting”.
**Integration branch:** `feature/SPENDLY-195-what-if-simulator`, cut from `origin/main`.

## Workflow

- Stories are implemented one at a time on `feature/SPENDLY-<story>-<slug>` branches.
- Each story is validated, committed, and reported to Jira before merge approval is requested.
- Story branches merge into this epic with `git merge --no-ff` only after explicit approval.
- Stories remain In Progress until the epic reaches `main`.

## Stories

| # | Story | Scope | Dependencies | State |
|---|---|---|---|---|
| 1 | [SPENDLY-196](https://kesavach.atlassian.net/browse/SPENDLY-196) | Scenario model and baseline snapshot | None | Implemented; merge approval pending |
| 2 | [SPENDLY-197](https://kesavach.atlassian.net/browse/SPENDLY-197) | Core financial projection engine | 196 | Implemented; merge approval pending |
| 3 | [SPENDLY-198](https://kesavach.atlassian.net/browse/SPENDLY-198) | Income, expense and purchase scenarios | 197 | Implemented; merge approval pending |
| 4 | [SPENDLY-199](https://kesavach.atlassian.net/browse/SPENDLY-199) | Debt, EMI and borrowing simulation | 197 | Implemented; merge approval pending |
| 5 | [SPENDLY-200](https://kesavach.atlassian.net/browse/SPENDLY-200) | Savings, goals and investment scenarios | 197 | Implemented; merge approval pending |
| 6 | [SPENDLY-201](https://kesavach.atlassian.net/browse/SPENDLY-201) | Baseline/scenario comparison and timeline | 198, 199, 200 | Implemented; merge approval pending |
| 7 | [SPENDLY-202](https://kesavach.atlassian.net/browse/SPENDLY-202) | Saved scenarios and lifecycle | 196, 201 | Completed on its story branch (save bug fixed, history, recalculation rule, live hook); merge approval pending |
| 8 | [SPENDLY-203](https://kesavach.atlassian.net/browse/SPENDLY-203) | QA, performance, safety and rollout | 198–202 | To Do |

## Decisions

- **2026-10-04:** Store only user-authored scenario assumptions and reproducibility metadata. Projection output remains derived from canonical data.
- **2026-10-04:** Use `users/{uid}/whatIfScenarios`, strict Firestore validation, emulator tests and TS↔rules contract tests when persistence is implemented.
- **2026-10-04:** Recalculate saved scenarios from current canonical data while retaining their original as-of/reference date.
- **2026-10-04:** Use the existing Runway, Calendar and Goal Funding contracts rather than creating duplicate systems.

## Downstream dependencies

- **SPENDLY-211** remains blocked until SPENDLY-195 is complete; it also depends on SPENDLY-210.
- **SPENDLY-219 What-If integration** remains on hold until SPENDLY-195 is complete; its Calendar portion is already complete.
- SPENDLY-195 also feeds the later SPENDLY-277 Action Center.
