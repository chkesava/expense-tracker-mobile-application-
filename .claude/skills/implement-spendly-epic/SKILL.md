---
name: implement-spendly-epic
description: Implement one Spendly Jira story/task within an epic efficiently, with targeted repository inspection, minimal context use, and financial-data safety.
---

# Implement one Spendly Jira issue efficiently

Use this skill only when the user asks to implement a specific Spendly Jira issue/story.

## Inputs
The user should provide a Jira key, for example `SPENDLY-436`. Do not ask for the entire epic or paste every child ticket unless the target issue genuinely needs them.

## Procedure
1. Retrieve the target Jira issue. Capture only: title, acceptance criteria, description, status, parent epic, and directly linked/blocking issues that affect this implementation.
2. Do not retrieve every issue in the epic. Follow dependencies only when the target issue's implementation is blocked or a dependency contract must be confirmed.
3. Inspect Git status before editing. Do not overwrite unrelated user changes.
4. Search narrowly for the relevant component/service/hook/type and its callers/tests. Read only the relevant sections. Widen the search only if the initial evidence is insufficient.
5. Produce a brief plan (up to 5 bullets) with likely files and preserved invariants. Proceed with implementation after planning unless a critical ambiguity or destructive action requires user input.
6. Implement the smallest complete change that satisfies acceptance criteria. Follow established Spendly patterns; avoid unrelated refactors and speculative abstractions.
7. Add focused regression tests for the bug/behavior. Do not change production data or run bulk migrations as part of ordinary implementation.
8. Run the most relevant tests first, then available typecheck/lint/build checks. If checks cannot run, state why.
9. Review the diff for unrelated changes, secrets, duplicate logic, broken navigation, Firebase query/read amplification, and data-integrity risks.
10. Return a concise report: Jira key, summary, files changed, tests run/results, remaining risks, and any required manual steps.

## Scope control
- One Jira issue per session whenever practical.
- Do not implement every child story when asked for one story.
- Do not redesign adjacent screens or refactor unrelated modules.
- Do not repeat a full architecture audit if the required architecture is already documented and the code evidence is sufficient.
- Do not dump full file contents in the conversation.
- Do not start subagents/agent teams for routine tasks; delegate only when a separate, substantial research task would materially reduce the main context.
- Update Jira status and comments as `docs/AGENT_WORKFLOW.md` §4 describes; that shared workflow wins if anything here disagrees.

## Spendly-specific constraints
- Use the existing Expo/React Native/TypeScript architecture and existing UI/component wrappers.
- Keep Firebase/Firestore as the current backend.
- Preserve current ledger, transaction, offline, idempotency, materialized-summary, reconciliation, and security contracts.
- For financial summary/balance fixes, identify the source-of-truth and mutation paths; never "fix" a mismatch by hardcoding or silently adding an adjustment.
- For UI redesigns, keep the task UI-only unless the Jira issue explicitly requires business-logic changes.
