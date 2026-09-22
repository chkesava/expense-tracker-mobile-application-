# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Spendly Epic Integration Strategy

Long-running financial epics use an integration branch. Ticket PRs merge into
that branch; the branch merges to `main` only when the epic is finished and the
user explicitly requests it.

## Start gate

- **SPENDLY-101** (`credit-cards-v2`) and **SPENDLY-102** (`ledger-v2`): do
  **not** create branches, code, or PRs until the epic is **In Progress** or
  the user explicitly says to start that epic.
- **SPENDLY-78** (`accounts-v2`): already started; continue remaining tickets
  there in the recorded order.
- Full playbooks:
  - [docs/SPENDLY-101-credit-cards-v2.md](docs/SPENDLY-101-credit-cards-v2.md)
  - [docs/SPENDLY-102-ledger-v2.md](docs/SPENDLY-102-ledger-v2.md)

## Shared ticket workflow

1. Confirm the epic start gate allows work.
2. Create the integration branch from latest `main` if missing.
3. Pull the integration branch; create `feat/SPENDLY-XXX-short-slug` from it.
4. Open the PR against the integration branch; merge there after checks pass.
5. Keep Jira out of Done until the final integration merge reaches `main`.

## Ticket order

### SPENDLY-78 Accounts Intelligence (`accounts-v2`) — in progress

1. Foundation: SPENDLY-81 (done), SPENDLY-82 (done), SPENDLY-83, SPENDLY-84
2. Intelligence: SPENDLY-80, SPENDLY-85, SPENDLY-86, SPENDLY-90
3. Statements: SPENDLY-79, SPENDLY-87
4. Context: SPENDLY-88, SPENDLY-89, SPENDLY-91

### SPENDLY-101 Credit Card Intelligence (`credit-cards-v2`) — wait until epic starts

Foundation done: SPENDLY-95, SPENDLY-97, SPENDLY-99

1. Discovery/health: SPENDLY-100, SPENDLY-103
2. Statement/rewards: SPENDLY-105, SPENDLY-107
3. Ingestion/analytics: SPENDLY-108, SPENDLY-104
4. Portability: SPENDLY-106

### SPENDLY-102 Ledger Intelligence (`ledger-v2`) — wait until epic starts

1. Foundation: SPENDLY-109, SPENDLY-111
2. Detail/integrity: SPENDLY-110, SPENDLY-112
3. Export: SPENDLY-113
4. Confirm whether SPENDLY-114 is a duplicate of SPENDLY-110 before implementing

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
