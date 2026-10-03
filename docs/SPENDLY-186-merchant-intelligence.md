# SPENDLY-186: Merchant Intelligence (epic tracker)

**Epic:** [SPENDLY-186](https://kesavach.atlassian.net/browse/SPENDLY-186), "Smarter Merchant Recognition & Spending Context".
**Integration branch:** `feature/SPENDLY-186-merchant-intelligence`, cut from **origin/main @ `db813fa`** on 2026-10-03. It's independent of the #212→#213→#214 stack.

**Plan:** [SPENDLY-186-plan.md](SPENDLY-186-plan.md). **Shared agent rules:** [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).

**Workflow:**
- Each story gets its own branch, cut from the epic branch and merged back `--no-ff` with approval.
- We go one story at a time.
- Stories move to Done only when the epic reaches `main`.

## Stories
| # | Story | Scope | Jira dependencies | State |
|---|---|---|---|---|
| 1 | [SPENDLY-187](https://kesavach.atlassian.net/browse/SPENDLY-187) | Merchant identity, alias and data model | None | Merged into the epic |
| 2 | [SPENDLY-188](https://kesavach.atlassian.net/browse/SPENDLY-188) | India-first normalization and alias registry | 187 | Merged into the epic |
| 3 | SPENDLY-189 | Deterministic resolution and confidence | 187, 188 | **Next.** Not started; the user said Codex will pick it up |
| 4 | SPENDLY-190 | Merchant-aware categories | 189 | Not started |
| 5 | SPENDLY-191 | Corrections and personalization | 189 | Not started |
| 6 | SPENDLY-192 | Merchant profile, grouping and search | 189 | Not started |
| 7 | SPENDLY-193 | Merchant patterns and recurring | 190, 192 | Not started |
| 8 | SPENDLY-194 | Privacy, performance, accuracy QA and rollout | 191–193 | Last |

## Decisions (2026-10-03)
- **Base branch:** origin/main.
- **Storage:** merchants are **derived on the fly** and are never written to expense or income documents. **Only user corrections are stored**, in a new validated `users/{uid}/merchantOverrides` collection (191).

## Guardrails
- **SMS code is read-only.** `services/sms/*` (the extractor, normalizer, catalog and categorizer) is left unchanged, because SMS dedupe keys and statement-import fingerprints include merchant strings.
- **No external AI or enrichment providers.** The registry is bundled.
