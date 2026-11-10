# SPENDLY-324: Salary Intelligence (epic tracker)

**Epic:** [SPENDLY-324](https://kesavach.atlassian.net/browse/SPENDLY-324), "💰 Salary Intelligence — Income Visibility, Stability & Paycheck Analytics".  
**Integration branch:** `feature/SPENDLY-324-salary-intelligence`, cut from `origin/main @ f06e28d9` on 2026-11-10.  
**Plan:** [SPENDLY-324-plan.md](SPENDLY-324-plan.md).  
**Shared agent rules:** [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).

**Workflow:**
- Each story gets its own branch, cut from the epic branch and merged back `--no-ff` with owner approval.
- We go one story at a time.
- Stories move to Done only when the epic reaches `main`.

## Stories
| # | Story | Scope | Jira dependencies | State |
|---|---|---|---|---|
| 1 | [SPENDLY-325](https://kesavach.atlassian.net/browse/SPENDLY-325) | Define salary domain model, payroll periods and provenance | None | In Progress |
| 2 | [SPENDLY-326](https://kesavach.atlassian.net/browse/SPENDLY-326) | Build salary detection and payroll transaction recognition | 325 | To Do |
| 3 | [SPENDLY-327](https://kesavach.atlassian.net/browse/SPENDLY-327) | Build salary review, confirmation and correction workflow | 325, 326 | To Do |
| 4 | [SPENDLY-328](https://kesavach.atlassian.net/browse/SPENDLY-328) | Build salary history and paycheck timeline | 325, 327 | To Do |
| 5 | [SPENDLY-329](https://kesavach.atlassian.net/browse/SPENDLY-329) | Build salary breakdown and deduction analysis | 325, 328 | To Do |
| 6 | [SPENDLY-330](https://kesavach.atlassian.net/browse/SPENDLY-330) | Build salary trend, growth and stability analytics | 328 | To Do |
| 7 | [SPENDLY-331](https://kesavach.atlassian.net/browse/SPENDLY-331) | Build salary irregularity and missing-paycheck intelligence | 326, 328, 330 | To Do |
| 8 | [SPENDLY-332](https://kesavach.atlassian.net/browse/SPENDLY-332) | Build salary forecast and expected-income planning | 328, 330 | To Do |
| 9 | [SPENDLY-333](https://kesavach.atlassian.net/browse/SPENDLY-333) | Integrate salary events with Financial Calendar and notifications | 328, 331, 332 | To Do |
| 10 | [SPENDLY-334](https://kesavach.atlassian.net/browse/SPENDLY-334) | Build Salary Intelligence dashboard and financial context insights | 327–333 | To Do |
| 11 | [SPENDLY-335](https://kesavach.atlassian.net/browse/SPENDLY-335) | Salary Intelligence QA, privacy, accuracy, performance and rollout | 325–334 | To Do |

## Key Decisions
- **Base branch:** origin/main.
- **Derived vs Stored:** Salary detection runs on the fly without changing source transactions. User confirmations, manual entries, and overrides are stored in `salaryRecords`, `salaryProfiles`, and `salaryReviews`.
- **EPF Linkage:** Wage month M salary deductions connect with the statutory remittance timeline to EPFO by the 15th of month M+1 (`shared/features/epf/utils/schedule.ts`).
- **Calendar & Notifications:** Adds `"salary"` as a calendar source with `direction: "in"`, paired with statutory EPF deposits (`direction: "neutral"`).
