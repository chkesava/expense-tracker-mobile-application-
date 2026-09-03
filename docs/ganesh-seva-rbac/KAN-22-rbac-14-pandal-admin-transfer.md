# KAN-22 — RBAC-14 — Pandal Admin Transfer

| Field | Value |
| --- | --- |
| Jira | [KAN-22](https://kesavach.atlassian.net/browse/KAN-22) |
| Feature | RBAC-14 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:49.759+0530 |
| Updated | 2026-08-31T14:32:46.586+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Provide a safe Admin-transfer workflow between trusted active Pandal members.

## Implementation

Allow authorized Admin to select eligible active member, review current/new roles, explicitly confirm transfer, and perform the role changes atomically. Preserve at least one Admin throughout. Do not implement transfer as two unrelated UI writes.

## Security

Target must already be an authorized active member. Prevent transfer to suspended/removed users, self-forged membership, arbitrary role injection and cross-Pandal targets. Require reauthentication/critical-action approval if configured.

## UX

Show impact warning and clear before/after Admin state. Prevent accidental navigation/submission during transfer.

## Tests

Unauthorized initiation, invalid target, concurrent transfers, final Admin protection, forged role writes and direct Firestore attempts.

## Done

Admin transfer is atomic, permission protected, auditable and cannot leave the Pandal without an Admin.

## Existing code to start from

- `services/ganesh/ganeshRoles.ts`
- `services/ganesh/ganeshAdminPromotion.test.ts`
- `app/(ganesh)/admin/roles/`

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
- [ ] Jira KAN-22 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
