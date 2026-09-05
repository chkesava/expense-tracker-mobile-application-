# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Phase Delivery Protocol
After completing every phase:
1. Provide a step-by-step **Manual Testing Guide** describing how to test/verify that phase on device/simulator.
2. Explicitly state **any commands the user needs to run** (or clearly state "No commands needed" if `npx expo start` hot-reload handles it).

# Atlassian / Jira

When using Atlassian Rovo MCP for this repository:
- **MUST** use Jira project key = `KAN` (Ganesh seva board)
- **MUST** use cloudId = `https://kesavach.atlassian.net` (do NOT call getAccessibleAtlassianResources)
- **MUST** use `maxResults: 10` or `limit: 10` for ALL Jira JQL and Confluence CQL search operations
- Do not create or search issues in `SAM1` or other Jira projects unless the user explicitly asks
- Board: https://kesavach.atlassian.net/jira/software/projects/KAN/board
- GitHub: https://github.com/chkesava/expense-tracker-mobile-application-

Branch, commit, and PR titles must include the issue key so GitHub for Jira links them to the KAN issue:
- Branch: `KAN-123-short-slug` or `feat/KAN-123-short-slug`
- For Ganesh Seva PRs, put `KAN-123` in the title and https://kesavach.atlassian.net/browse/KAN-123 in the body
