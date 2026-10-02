# SPENDLY-204: Financial Runway (epic tracker)

**Epic:** [SPENDLY-204](https://kesavach.atlassian.net/browse/SPENDLY-204), "Cash Survival & Financial Resilience Planning".
**Integration branch:** `feature/SPENDLY-204-financial-runway`, cut from origin/main @ `db813fa` on 2026-10-02.

**Workflow:**
- Each story gets its own `feature/SPENDLY-2xx-slug` branch, cut from the epic branch and merged back `--no-ff` with approval.
- We go one story at a time.
- Stories move to Done only when the epic reaches `main`.

**Roadmap position:** this is the next major epic after SPENDLY-312 and SPENDLY-361 (`.claude/spendly_epic_execution_roadmap.md`).

## Stories
| # | Story | Scope | Jira dependencies | State |
|---|---|---|---|---|
| 1 | [SPENDLY-205](https://kesavach.atlassian.net/browse/SPENDLY-205) | Liquidity, burn classes, calculation contract | None | Merged to the epic branch |
| 2 | [SPENDLY-207](https://kesavach.atlassian.net/browse/SPENDLY-207) | Liquid resource classification and overrides | 205 | Merged to the epic branch |
| 3 | SPENDLY-206 | Calculation and projection engine | 205, 207 | Not started |
| 4 | SPENDLY-208 | Historical burn rate and baseline | 206 | Not started |
| 5 | SPENDLY-209 | Commitment-aware runway using Financial Calendar | 206; needs **SPENDLY-176** | Blocked: SPENDLY-176 is To Do |
| 6 | SPENDLY-210 | Timeline, threshold planning, explanatory UI | 206, **209** | Blocked through 209 |
| 7 | SPENDLY-211 | What-If integration | 210; needs **SPENDLY-195** | Blocked: SPENDLY-195 is To Do |
| 8 | SPENDLY-212 | QA and rollout | 206, 208–211 | Last |

## Decisions
- **2026-10-02:** liquid by default means bank, cash and wallet only.
  - Near-liquid (shown, opt-in): FD, mutual funds, interest-savings, demat cash.
  - Restricted: EPF, stocks.
  - Expected inflow: receivables.
  - Obligations: credit cards, borrowings.
- **2026-10-02 (207):** overrides are allowed for a safe set only. Bank, cash and wallet can be excluded; near-liquid items and unrecognised accounts can be included; EPF, stocks, receivables, cards and loans are locked (the rules enforce this). The UI is a Runway sources screen plus a row on account detail.
- **2026-10-02:** savings and investment contributions are a separate, pausable class. They count in net burn and stay out of essential burn.

## Open: where Jira differs from the roadmap
- The roadmap says the core of 204 doesn't need the Calendar. In Jira, **210 (the UI) is blocked by 209**, which needs SPENDLY-176. Unless that link is relaxed, for example by shipping 210 with net and gross modes and adding the projection when 209 lands, the runway UI can't ship before the Calendar. **This needs a decision before 209 or 210.**
- 211 needs SPENDLY-195 (What-If), which the roadmap schedules after 204.
