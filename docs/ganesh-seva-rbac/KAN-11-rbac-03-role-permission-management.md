# KAN-11 — RBAC-03 — Role & Permission Management

| Field | Value |
| --- | --- |
| Jira | [KAN-11](https://kesavach.atlassian.net/browse/KAN-11) |
| Feature | RBAC-03 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:21.414+0530 |
| Updated | 2026-08-31T14:31:10.147+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Build one canonical, granular RBAC model allowing the Pandal Admin to create roles, define permissions and assign roles to members.

## Implementation Plan

* Inventory existing roles/permissions before refactoring.
* Define stable permission IDs as resource + action, e.g. `expenses.view`, `expenses.create`, `expenses.edit`, `expenses.delete`, `expenses.void`, `funds.transfer`, `festival.settle`.
* Support built-in protected roles plus custom roles.
* Store role-permission mappings and member-role assignments in the existing Pandal-scoped model.
* Calculate effective permissions centrally; avoid hard-coded role-name checks throughout screens.
* Prevent members from changing their own roles/permissions.
* Protect system-critical roles/permissions from accidental deletion.

## UX

Admin dashboard should show members, assigned roles, effective permissions, custom-role creation/editing, and warnings for sensitive permissions. Changes require confirmation.

## Security

RBAC management must be enforced in Firestore Rules. A client must never be able to grant itself permission by writing a role document.

## Tests

Test role creation, assignment, removal, custom permissions, self-escalation, unauthorized admin actions, deleted role references, and simultaneous role updates.

## Done

One permission registry and one effective-permission evaluator are used by the application and authorization layer; all changes are audited.

## Existing code to start from

- `shared/utils/ganeshPermissions.ts`
- `shared/utils/ganeshPermissionRegistry.ts`
- `services/ganesh/ganeshRoles.ts`
- `app/(ganesh)/admin/roles/`
- `hooks/useGaneshWrites.ts` — setMemberRoleIds

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
- [ ] Jira KAN-11 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
