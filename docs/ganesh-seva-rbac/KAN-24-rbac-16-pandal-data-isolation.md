# KAN-24 — RBAC-16 — Pandal Data Isolation

| Field | Value |
| --- | --- |
| Jira | [KAN-24](https://kesavach.atlassian.net/browse/KAN-24) |
| Feature | RBAC-16 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:05.203+0530 |
| Updated | 2026-08-31T14:33:02.400+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Guarantee strict Pandal-level data isolation across every Ganesh Seva collection.

## Implementation

Inventory all Pandal-scoped collections and document references. Every read/write must validate that the authenticated user is an ACTIVE member of the target Pandal and that the document belongs to that Pandal. Validate parent-child relationships on nested Festival/finance/collection/asset records.

## Security

Reject cross-Pandal read, create, update, delete and document moves. Never trust a Pandal ID supplied by navigation state, local storage or request payload. Prevent changing pandalId after creation except controlled migrations.

## Tests

Create two Pandals and test every representative collection with users from each Pandal, including forged IDs and batch writes.

## Done

Cross-Pandal access is denied at Firestore Rules level and covered by automated regression tests.

## Existing code to start from

- `firestore.rules`
- `shared/utils/ganeshPaths.ts`
- `services/ganesh/ganeshWrites.ts`

## How to implement

1. Read this ticket and the related files above before writing code.
2. Reuse the current Ganesh membership, role, and permission model. Do not invent a parallel RBAC system.
3. Keep Expense Tracker and Nutrition Tracker authorization unchanged.
4. Enforce the rule in Firestore / trusted writes first, then hide or disable the matching UI.
5. Add or extend tests for allow and deny paths, including direct Firestore access that bypasses the UI.
6. If `firestore.rules` change, follow `docs/FIREBASE_RULES_DEPLOY.md`.
7. After shipping, update this file's **Implementation status** and the Jira ticket.

## Implementation status

- [ ] Inspected existing code
- [ ] Security boundary implemented (Rules / trusted write)
- [ ] Client UX updated
- [ ] Tests added
- [ ] Manual verification
- [ ] Jira KAN-24 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
