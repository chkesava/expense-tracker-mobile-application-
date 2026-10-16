# Spendly Jira implementation prompt template

Start a fresh Claude Code session at the Spendly repository root, then use this short prompt:

> Implement **SPENDLY-XXX** using the `implement-spendly-epic` skill.
> Retrieve only this Jira issue and directly relevant dependencies. Inspect only the relevant code paths, implement the smallest complete change, add focused regression tests, and run relevant checks.
> Preserve existing Spendly architecture and Firebase/data-integrity behavior. Do not implement other epic stories or perform unrelated refactors. Report changed files, actual test results, and unresolved risks concisely.

Replace `SPENDLY-XXX` with the exact Jira issue key.

## Suggested session routine
1. `claude` from the repository root.
2. `/context` if the session feels large; use it to see what occupies context.
3. Submit the prompt above.
4. After finishing the issue, save any essential finding in the appropriate project documentation only if it is reusable and not already discoverable from code.
5. Run `/clear` before starting an unrelated Jira issue. Project instructions remain available.
6. Use `/compact` only when continuing the same task and you need to preserve the current task state.

## Do not do this
- Do not paste the entire epic, all child stories, a full repository tree, or large source files unless the implementation requires them.
- Do not ask Claude to "analyze the whole app" for each ticket.
- Do not put long implementation procedures in the root `CLAUDE.md`; the skill is loaded when invoked.
