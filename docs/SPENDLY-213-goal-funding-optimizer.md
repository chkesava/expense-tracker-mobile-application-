# SPENDLY-213: Goal Funding Optimizer (epic tracker)

**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213), "Multi-Goal Allocation & Target Planning".

**Integration branch:** `feature/SPENDLY-213-goal-funding-optimizer`, cut on 2026-10-03 from **`feature/SPENDLY-176-financial-calendar`**. That branch is draft PR #213, which itself sits on runway PR #212.
- It reuses the runway surplus and the calendar commitments.
- **Merge order: #212, then #213, then this epic.**

**Workflow:**
- Each story gets its own branch, cut from the epic branch and merged back `--no-ff` with approval.
- We go one story at a time.
- Stories move to Done only when the epic reaches `main`.

## Stories
| # | Story | Scope | Jira dependencies | State |
|---|---|---|---|---|
| 1 | [SPENDLY-214](https://kesavach.atlassian.net/browse/SPENDLY-214) | Model and constraints | None | Merged to the epic branch |
| 2 | [SPENDLY-215](https://kesavach.atlassian.net/browse/SPENDLY-215) | Funding capacity and affordability | 214 | Merged to the epic branch |
| 3 | [SPENDLY-216](https://kesavach.atlassian.net/browse/SPENDLY-216) | Target-date maths and funding gaps | 214 | Merged to the epic branch |
| 4 | [SPENDLY-217](https://kesavach.atlassian.net/browse/SPENDLY-217) | Multi-goal allocation modes | 215, 216 | Merged to the epic branch |
| 5 | SPENDLY-219 | Financial Calendar and What-If inputs | 176 (built, #213), **195 (To Do)** | Calendar part merged to the epic branch; **Merged to the epic branch (What-If completed)** |
| 6 | [SPENDLY-218](https://kesavach.atlassian.net/browse/SPENDLY-218) | Comparison and funding-plan UI | 217, 219 (What-If wait relaxed 2026-10-03) | Merged to the epic branch |
| 7 | [SPENDLY-220](https://kesavach.atlassian.net/browse/SPENDLY-220) | Saved funding plans | 218 | Merged to the epic branch |
| 8 | [SPENDLY-221](https://kesavach.atlassian.net/browse/SPENDLY-221) | QA and rollout | 217–220 | Ready parts merged to epic. Device QA open; What-If cases wait for SPENDLY-195 |

## Decisions (2026-10-03)
- The base is the calendar epic branch, so its PR is a three-PR stack.
- **219:** build the Financial Calendar input now and hold the What-If part for SPENDLY-195.
- **218:** no longer waits for 219's What-If part, the same approach as runway 210. The "219 blocks 218" link should be removed in Jira by hand.
