# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Shared agent workflow (read first)

Before any task, read **[docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md)** and follow it. It is the single source of truth shared by Codex and Claude Code. It covers:
- the story-by-story branching and approval rules;
- Jira status rules;
- validation;
- safety;
- handoff.

It also points to the roadmap (`.claude/spendly_epic_execution_roadmap.md`, context only) and to the active epic's tracker and plan in `docs/`.

# Project context (read second)

Read **[docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)** next. It covers:
- the current architecture (Firestore + Supabase read model, GitHub Actions jobs, Cloudflare, the Spark plan limits);
- the owner's standing rules;
- known traps;
- a snapshot of where things stand.

`CLAUDE.md` holds the full Spendly and Ganesh Seva rules and applies to every agent, not only Claude Code.

# Read-model architecture (SPENDLY-494, SPENDLY-586)

Firestore is the source of truth. Supabase (`supabase-readmodel/`) is the read model, and Firestore wins any difference.

**Writes:**
- Every save goes to Firestore first, through `commitMutations`.
- It then goes to Supabase, only through the on-device outbox and the `rm_client_apply` RPC.
- Server writers use `trackServerBatch` + `createServerPush`.

**Reads:**
- Screens read through `useReadModelSource("<collection>")`: `firestore` by default, `shadow` to compare, `supabase` to read the on-device copy.
- The Firestore fallback always stays.

**Every new feature, collection or field must save to and read from both stores in the same story:**
- the mapping;
- the migration with RLS;
- the allowlist;
- the purge;
- the indexes;
- the guard tests.

**No calculations in the app:** they run as server jobs (SPENDLY-735).

Rules: **[docs/READ_MODEL_RULES.md](docs/READ_MODEL_RULES.md)**. Operations: `docs/READMODEL_RUNBOOK.md`.

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
