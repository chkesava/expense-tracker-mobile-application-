# KAN-12 — RBAC-04 — Permission-Based CRUD Authorization

| Field | Value |
| --- | --- |
| Jira | [KAN-12](https://kesavach.atlassian.net/browse/KAN-12) |
| Feature | RBAC-04 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:28.817+0530 |
| Updated | 2026-08-31T14:31:18.346+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Enforce granular resource/action permissions consistently in both React Native UX and Firestore Rules.

## Implementation

Create a central permission matrix covering view/create/edit/delete/void and sensitive actions. Replace scattered role checks with a reusable `hasPermission(resource, action, context)` service. Map every Ganesh Seva module to explicit permissions. UI should hide/disable unavailable actions, but never be treated as the security boundary.

## Sensitive Actions

Treat delete/void, fund transfer, cash reconciliation, Festival settlement, Admin changes, role changes and member removal as separate permissions.

## Security

Rules must independently reject unauthorized direct requests and forged client state. Prevent privilege escalation by changing local storage, navigation params or cached user state.

## Edge Cases

Unknown permission, deleted role, stale membership, offline stale permissions and concurrent permission changes must fail safely.

## Tests

Build a permission matrix test suite for every role/action and Firestore allow/deny tests. Verify UI visibility matches effective permissions.

## Done

No module performs authorization using hard-coded role names as its only control; all sensitive writes use centralized authorization and are auditable.

## Existing code to start from

- `hooks/useGaneshPermissions.ts`
- `hooks/useGaneshWrites.ts`
- `shared/utils/ganeshPermissionRegistry.ts` — hasPermission
- `shared/utils/ganeshPermissions.ts` — assertHasPermission
- `firestore.rules` — hasPermOf

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
- [ ] Jira KAN-12 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
