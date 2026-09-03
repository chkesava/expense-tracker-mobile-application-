# KAN-28 — RBAC-20 — Temporary Permissions

| Field | Value |
| --- | --- |
| Jira | [KAN-28](https://kesavach.atlassian.net/browse/KAN-28) |
| Feature | RBAC-20 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:38.443+0530 |
| Updated | 2026-08-31T14:33:33.476+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Allow temporary Festival responsibilities without leaving permanent elevated access.

## Implementation

Support optional start/end timestamps for temporary role or permission grants. Effective permissions must include a grant only while current time is within its validity window. Store grant reason, creator and lifecycle state. Provide revoke capability.

## Security

Client cannot extend its own expiry or alter the target/grant. Firestore authorization must evaluate expiry from trusted timestamps. Expired access must fail even if stale UI/cache says it is active.

## UX

Show temporary badge, expiry date/time, creator and revoke action. Warn Admin before granting sensitive temporary permissions.

## Tests

Before-start deny, active allow, after-expiry deny, self-extension deny, forged expiry, revoke, offline stale permission and concurrent revoke/use.

## Done

Temporary access automatically ceases and every grant/revoke/expiry event is auditable.

## Existing code to start from

- `shared/utils/ganeshPermissions.ts`
- `services/ganesh/ganeshRoles.ts`
- `hooks/useGaneshPermissions.ts`

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
- [ ] Jira KAN-28 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
