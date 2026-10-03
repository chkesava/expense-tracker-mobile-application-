# SPENDLY-176: Financial Calendar (epic tracker)

**Epic:** [SPENDLY-176](https://kesavach.atlassian.net/browse/SPENDLY-176), "Unified Financial Planning Timeline".
**Integration branch:** `feature/SPENDLY-176-financial-calendar`, cut from **`feature/SPENDLY-204-financial-runway`** (draft PR #212) on 2026-10-03, so it reuses the runway scheduling, event adapters and counted money. **This epic's PR can only merge after #212.**

**Workflow:**
- Each story gets its own `feature/SPENDLY-1xx-slug` branch, cut from the epic branch and merged back `--no-ff` with approval.
- We go one story at a time.
- Stories move to Done only when the epic reaches `main`.

## Stories
| # | Story | Scope | Jira dependencies | State |
|---|---|---|---|---|
| 1 | [SPENDLY-177](https://kesavach.atlassian.net/browse/SPENDLY-177) | Event model and source mapping | None | Merged to the epic branch |
| 2 | [SPENDLY-178](https://kesavach.atlassian.net/browse/SPENDLY-178) | Aggregation and query layer | 177 | Merged to the epic branch |
| 3 | [SPENDLY-179](https://kesavach.atlassian.net/browse/SPENDLY-179) | Month view and navigation | 177, 178 | Merged to the epic branch |
| 4 | [SPENDLY-180](https://kesavach.atlassian.net/browse/SPENDLY-180) | Day and week agenda | 177, 178 | Merged to the epic branch |
| 5 | [SPENDLY-181](https://kesavach.atlassian.net/browse/SPENDLY-181) | Event detail and source actions | 177 | Merged to the epic branch |
| 6 | [SPENDLY-182](https://kesavach.atlassian.net/browse/SPENDLY-182) | Upcoming commitments and projected cash summary | 177 | Merged to the epic branch |
| 7 | [SPENDLY-183](https://kesavach.atlassian.net/browse/SPENDLY-183) | User reminders and recurring events | 177, 182 | Committed on its story branch, awaiting merge approval |
| 8 | SPENDLY-184 | Reminders and notifications | None in Jira | Not started. **Local notifications** (decision 2026-10-03); remote push stays with SPENDLY-222 |
| 9 | SPENDLY-185 | QA, accessibility, performance, analytics | 181 | Last |

## Decisions (2026-10-03)
- The base is the runway epic branch, so the calendar reuses its scheduling and doesn't duplicate it.
- 184 is built on the existing on-device notification pattern from card bills.
- Entry points:
  - the drawer item "Financial calendar";
  - a "View calendar" link on the dashboard upcoming-dues widget;
  - "Add reminder" in the + sheet (183).

## What this unblocks
| Ticket | Waiting for |
|---|---|
| Runway SPENDLY-209 | The calendar events contract (177/178) |
| Fee SPENDLY-320 | The calendar contract (it adds a fee source) |
| Decision SPENDLY-367 (calendar part) | `decisionCalendarEvents` maps onto this contract |
| SPENDLY-219 (goals), SPENDLY-277 (action centre) | The calendar |

The fee and decision epics are on separate branches (PRs #210 and #211). Their calendar sources join when those stories are picked up.
