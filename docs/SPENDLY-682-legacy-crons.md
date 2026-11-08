# SPENDLY-682 tracker — legacy SIP and bill crons rebuilt in this repo

Plan: [SPENDLY-682-plan.md](SPENDLY-682-plan.md). Integration branch: `feature/SPENDLY-682-legacy-crons-in-repo`.

| Sub-task | Jira | Branch | State |
|---|---|---|---|
| A: server foundations | SPENDLY-725 | `feature/SPENDLY-725-daily-job-foundations` | merged into the 682 branch 6a7dd22e ([doc](SPENDLY-725-daily-job-foundations.md)) |
| B: SIP daily job | SPENDLY-726 | `feature/SPENDLY-726-sip-daily-job` | not started |
| C: bill daily job | SPENDLY-727 | `feature/SPENDLY-727-bill-daily-job` | not started |
| D: read-only reports | SPENDLY-728 | `feature/SPENDLY-728-legacy-data-reports` | not started |
| E: cut-over + runbook | SPENDLY-729 | `feature/SPENDLY-729-legacy-crons-cutover` | not started |

## Decisions
- **2026-11-05 (user):** retire the legacy `sip-execute` and `credit-card-bills` crons; rebuild them here.
- **2026-11-08 (user):**
  - scheduling: Cloudflare Worker daily dispatch;
  - keep the "statement created" inbox notice (deterministic id);
  - SIP quotes fetched directly, with failed + retry the next day;
  - five sub-tasks, one at a time, approval before each merge.

- 2026-11-08: SPENDLY-731 logged. Monthly day 29–31 SIPs skip a month (setMonth overflow). 725 keeps the rule so the server matches the phone.

## Drift noted
`docs/AGENT_WORKFLOW.md` §1 says to read `.claude/spendly_epic_execution_roadmap.md`, but that file doesn't exist in this checkout (2026-11-08).
