# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

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
