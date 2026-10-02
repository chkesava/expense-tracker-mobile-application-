# SPENDLY-361 — Financial Decision Journal ("Money Decisions")

**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — *Financial Decision Journal — Decision History, Rationale & Outcome Learning*
**Integration branch:** `feature/SPENDLY-361-financial-decision-journal`, cut from `origin/main` @ `20cf3be` and independent of the fee epic (PR #210). Each story gets its own branch, `feature/SPENDLY-3xx-<slug>`, cut from the epic branch. A story is merged back `--no-ff` **only after approval**, and the next story starts only after asking.
**Name:** "Money Decisions" in the UI, `/decisions` as the route, and a `decision*` / `MoneyDecision` prefix in code. The ledger is already called "Journal" (SPENDLY-102), so this name avoids confusing the two.
**Scope:** Spendly only.
**Jira rule:** a story stays In Progress until the epic reaches `main`.

## Architecture in one paragraph

A decision is a record of reasoning, not money. It is stored at `users/{uid}/decisions/{id}` and never holds an authoritative amount; the rules refuse `amount` and `date` fields. Linked Spendly records are references only. Anything copied from them at the time is labelled as captured history and is never added into a total. Facts, assumptions (each with provenance), user inputs, rationale, the expected outcome and the actual outcome are all kept in separate fields. When the user first decides, `decisionSnapshot` freezes the reasoning, and the rules pin it from then on. `users/{uid}/decisionEvents` is an append-only audit log that stores field names and statuses, never content.

## Story map

| Order | Story | Summary | State |
|---|---|---|---|
| 1 | [SPENDLY-362](https://kesavach.atlassian.net/browse/SPENDLY-362) | Domain model, lifecycle, provenance, rules | Merged to epic |
| 2 | [SPENDLY-363](https://kesavach.atlassian.net/browse/SPENDLY-363) | Capture and editing, minimal list, entry points | Merged to epic |
| 3 | [SPENDLY-364](https://kesavach.atlassian.net/browse/SPENDLY-364) | Templates | Merged to epic |
| 4 | [SPENDLY-365](https://kesavach.atlassian.net/browse/SPENDLY-365) | Alternatives and comparison workspace | Merged to epic |
| 5 | [SPENDLY-366](https://kesavach.atlassian.net/browse/SPENDLY-366) | Linked records and context | Merged to epic |
| 6 | [SPENDLY-367](https://kesavach.atlassian.net/browse/SPENDLY-367) | Commitments and review dates | Merged to epic. The Financial Calendar part waits for SPENDLY-176 |
| 7 | SPENDLY-368 | History, timeline, search | To Do |
| 8 | SPENDLY-369 | Expected vs actual outcomes | To Do |
| 9 | SPENDLY-370 | Insights | To Do |
| — | SPENDLY-371 | Reminders and notifications | **On hold** until SPENDLY-222 (user decision, 2026-09-30) |
| 10 | SPENDLY-372 | QA and rollout | To Do. Notification QA waits for 371 |

## Per-story records

* [SPENDLY-362](SPENDLY-362-decision-domain-model.md)
* [SPENDLY-363](SPENDLY-363-decision-capture.md)
* [SPENDLY-364](SPENDLY-364-decision-templates.md)
* [SPENDLY-365](SPENDLY-365-decision-comparison.md)
* [SPENDLY-366](SPENDLY-366-decision-linked-records.md)
* [SPENDLY-367](SPENDLY-367-decision-commitments.md)
