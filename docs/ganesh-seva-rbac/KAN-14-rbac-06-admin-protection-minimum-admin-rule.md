# KAN-14 — RBAC-06 — Admin Protection & Minimum Admin Rule

| Field | Value |
| --- | --- |
| Jira | [KAN-14](https://kesavach.atlassian.net/browse/KAN-14) |
| Feature | RBAC-06 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:46.017+0530 |
| Updated | 2026-08-31T14:31:36.699+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Prevent loss or takeover of Pandal administration.

## Implementation

Enforce a minimum of one ACTIVE Admin. Only authorized Admin-management permissions can promote/demote/remove Admins. Implement final-Admin protection as an atomic operation so concurrent changes cannot leave zero Admins. Prevent self-promotion and unsafe self-demotion. If an Admin needs to leave, require controlled transfer first.

## UX

Admin Management must clearly show active Admins, protected final Admin state, impact warnings and confirmation for role changes.

## Security

All constraints must be enforced server-side/Firestore Rules or trusted backend operation where Rules cannot safely perform the required cross-document invariant. Never trust a client count of Admins.

## Concurrency

Use transaction/atomic semantics for Admin changes and test two simultaneous demotion/removal attempts.

## Tests

Attempt self-promotion, final-Admin removal, simultaneous demotion, cross-Pandal role change and unauthorized direct writes.

## Done

Pandal can never be left without an authorized Admin through supported or direct client operations, and all Admin changes are audited.

## Existing code to start from

- `firestore.rules` — adminCountDeltaBounded, canManageMembersOf
- `services/ganesh/ganeshAdminPromotion.test.ts`
- `services/ganesh/ganeshRoles.ts`
- `ganesh seva future ideas/GANESH_SEVA_AUDIT_TICKETS.md (GS-014, GS-015)`

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
- [ ] Jira KAN-14 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
