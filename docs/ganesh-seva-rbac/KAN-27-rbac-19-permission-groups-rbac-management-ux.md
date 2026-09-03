# KAN-27 — RBAC-19 — Permission Groups & RBAC Management UX

| Field | Value |
| --- | --- |
| Jira | [KAN-27](https://kesavach.atlassian.net/browse/KAN-27) |
| Feature | RBAC-19 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:30.504+0530 |
| Updated | 2026-08-31T14:33:25.885+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Create a safe, understandable Admin UI for managing roles and permissions.

## Implementation

Group permissions by domain: Finance, Collections, Members, RBAC, Festivals, Assets, Tasks, Duties, Audit and Settlement. Build reusable permission selectors and effective-permission calculation. Show inherited permissions from roles and direct/temporary grants if supported.

## UX

Use the established Expense Tracker design language: clear hierarchy, cards/lists, searchable members, readable role summaries, confirmation dialogs and sensitive-action warnings. Never make users understand raw Firestore structure.

## Security

Management controls render only when authorized, but all mutations still pass centralized authorization and Rules.

## Edge Cases

Unknown/deleted permission, removed role, conflicting roles and stale cached permissions should fail safely and refresh from authoritative data.

## Tests

UI visibility matrix plus direct-write authorization tests. Verify changing a role updates effective access without requiring app reinstall.

## Done

Admin can confidently inspect and manage access without duplicated permission logic.

## Existing code to start from

- `components/ganesh/PermissionChecklist.tsx`
- `app/(ganesh)/admin/roles/`
- `app/(ganesh)/admin/index.tsx`
- `shared/utils/ganeshPermissionRegistry.ts`

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
- [ ] Jira KAN-27 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
