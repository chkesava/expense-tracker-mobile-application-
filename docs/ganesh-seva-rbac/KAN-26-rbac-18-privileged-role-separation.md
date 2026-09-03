# KAN-26 — RBAC-18 — Privileged Role Separation

| Field | Value |
| --- | --- |
| Jira | [KAN-26](https://kesavach.atlassian.net/browse/KAN-26) |
| Feature | RBAC-18 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:22.329+0530 |
| Updated | 2026-08-31T14:33:18.095+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Separate privileged responsibilities so no ordinary volunteer automatically receives dangerous controls.

## Implementation

Document built-in roles such as Pandal Admin, Treasurer, Collection Manager and Volunteer, then map them to granular permissions. Keep role names separate from authorization logic. Allow custom roles through the central RBAC model.

## Security

Sensitive capabilities—role management, Admin transfer, Permanent Fund transfer, settlement, audit administration and member removal—must be explicit. Avoid a broad `admin=true` shortcut throughout the app.

## UX

Admin dashboard displays role responsibilities and effective permissions. Warn before assigning high-impact permissions.

## Tests

Verify each built-in role against the permission matrix and ensure custom roles cannot bypass protected operations.

## Done

Least-privilege defaults are documented, implemented and covered by authorization tests.

## Existing code to start from

- `shared/utils/ganeshPermissionRegistry.ts` — ADMIN_ONLY_PERMISSION_GROUPS
- `services/ganesh/ganeshRoles.ts`
- `firestore.rules` — canManageMembersOf
- `ganesh seva future ideas/GANESH_SEVA_AUDIT_TICKETS.md (GS-016)`

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
- [ ] Jira KAN-26 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
