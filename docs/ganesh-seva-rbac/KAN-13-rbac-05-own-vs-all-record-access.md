# KAN-13 — RBAC-05 — Own vs All Record Access

| Field | Value |
| --- | --- |
| Jira | [KAN-13](https://kesavach.atlassian.net/browse/KAN-13) |
| Feature | RBAC-05 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:37.377+0530 |
| Updated | 2026-08-31T14:31:27.948+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Implement secure own-record versus all-record access without trusting client ownership fields.

## Implementation

Define ownership consistently using authenticated Firebase UID stored on records. Add reusable checks for `viewOwn`, `editOwn`, `viewAll`, `editAll` where relevant. Apply to collections, expenses, tasks, duties, contributions and other user-created records after reviewing the real schema.

## Security Rules

A client cannot change ownerId to gain access. Create operations must establish trusted ownership; update operations must prevent ownership/pandal/festival reassignment unless a dedicated privileged workflow allows it.

## UX

Show users only records they are authorized to see and only expose edit/delete controls they can use. Explain read-only states where useful.

## Edge Cases

Missing ownerId, legacy records, deleted users, offline edits and ownership changes must fail safely.

## Tests

User A can edit own record; User A cannot edit User B record; privileged user can edit all; forged ownerId is rejected; cross-Pandal records are rejected.

## Done

Ownership semantics are documented, centrally evaluated and enforced in Rules and tests.

## Existing code to start from

- `shared/utils/ganeshPermissions.ts`
- `firestore.rules` — ganeshIdentityCreate / ganeshIdentityUpdate
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
- [ ] Jira KAN-13 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
