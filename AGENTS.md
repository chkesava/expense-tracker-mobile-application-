# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# SPENDLY-78 Accounts V2 Integration Flow

The Accounts Intelligence & Statement Suite epic (`SPENDLY-78`) uses
`accounts-v2` as its integration branch.

- For each remaining epic ticket, pull the latest `accounts-v2` and create the
  ticket branch from it, not from `main`.
- Keep the Jira key in the branch, commit, and PR title.
- Open each ticket PR against `accounts-v2`.
- After checks pass, merge the ticket PR into `accounts-v2`.
- Do not merge `accounts-v2` into `main` until every SPENDLY-78 ticket is
  complete and the user explicitly requests the final epic merge.
- A ticket merged only into `accounts-v2` is not shipped to `main`; keep Jira
  out of Done until the final integration reaches `main`.

Follow this ticket order unless the user explicitly changes it:

1. Foundation and transaction experience:
   - SPENDLY-81 Running balance (complete)
   - SPENDLY-82 Advanced filters (complete)
   - SPENDLY-83 Search
   - SPENDLY-84 Monthly statement summary
2. Derived account intelligence:
   - SPENDLY-80 Health and overview metrics
   - SPENDLY-85 Spending insights
   - SPENDLY-86 Balance trend/history
   - SPENDLY-90 Activity statistics
3. Statement and reconciliation workflows:
   - SPENDLY-79 PDF/CSV statement export
   - SPENDLY-87 Bank-account reconciliation
4. Supporting account context and final organization:
   - SPENDLY-88 Documents and attachments
   - SPENDLY-89 Notes
   - SPENDLY-91 Action center

# Phase Delivery Protocol
After completing every phase:
1. Provide a step-by-step **Manual Testing Guide** describing how to test/verify that phase on device/simulator.
2. Explicitly state **any commands the user needs to run** (or clearly state "No commands needed" if `npx expo start` hot-reload handles it).
3. For Firebase / rules / shared-client tickets, leftover **rules deploy, Netlify, and Android** steps are in [docs/AFTER_MERGE_CHECKLIST.md](docs/AFTER_MERGE_CHECKLIST.md). Paste that Jira leftover block on the ticket; do not treat merge-to-main as shipped.

# Atlassian / Jira

When using Atlassian Rovo MCP for this repository:
- **MUST** use Jira project key = `SPENDLY` (Spendly board) by default
- Use project `KAN` only for Ganesh Seva work, or when the user explicitly asks
- **MUST** use cloudId = `https://kesavach.atlassian.net` (do NOT call getAccessibleAtlassianResources)
- **MUST** use `maxResults: 10` or `limit: 10` for ALL Jira JQL and Confluence CQL search operations
- Do not create or search issues in `SAM1` or other Jira projects unless the user explicitly asks
- Board: https://kesavach.atlassian.net/jira/software/projects/SPENDLY/board
- GitHub: https://github.com/chkesava/expense-tracker-mobile-application-

Branch, commit, and PR titles must include the issue key so GitHub for Jira links them to the SPENDLY issue:
- Branch: `SPENDLY-123-short-slug` or `feat/SPENDLY-123-short-slug`
- For Spendly PRs, put `SPENDLY-123` in the title and https://kesavach.atlassian.net/browse/SPENDLY-123 in the body

Keep the Jira issue status in sync:
- Pick a ticket → **In Progress** (comment if scope/plan changed)
- Merged to `main` → **Done** (comment with commit/PR link and leftovers)
- Do not mark Done until the merge or direct push to `main` succeeds
