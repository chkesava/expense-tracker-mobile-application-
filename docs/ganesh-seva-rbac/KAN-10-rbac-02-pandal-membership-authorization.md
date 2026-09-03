# KAN-10 — RBAC-02 — Pandal Membership Authorization

| Field | Value |
| --- | --- |
| Jira | [KAN-10](https://kesavach.atlassian.net/browse/KAN-10) |
| Feature | RBAC-02 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:13.480+0530 |
| Updated | 2026-08-31T14:31:01.218+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Make Pandal membership the authoritative gate between Firebase authentication and shared Ganesh Seva data.

## Implementation Plan

* Reuse the existing membership model; do not create a parallel membership system.
* Define lifecycle states: PENDING, ACTIVE, SUSPENDED, REMOVED.
* Validate membership using trusted authenticated UID and target Pandal ID.
* Ensure membership documents cannot be created or activated by arbitrary clients.
* Separate authentication from authorization: a signed-in Firebase user still has no Pandal access until approved.
* Preserve membership history rather than deleting evidence of previous membership.

## Rules

ACTIVE members may proceed to RBAC evaluation. PENDING/SUSPENDED/REMOVED members must fail protected reads and writes. Users cannot add themselves to arbitrary Pandals, alter their own status, role, or membership Pandal.

## UX

Show clear states: invitation/request pending, approved, suspended, removed, and no Pandal. Do not expose protected data before approval.

## Tests

Cover forged UID, forged pandalId, self-activation, self-role assignment, cross-Pandal membership access, status transitions, removed users and direct Firestore access.

## Done

All protected queries depend on validated membership and Security Rules enforce the lifecycle independently of the UI.

## Existing code to start from

- `hooks/usePandalMembers.ts`
- `services/ganesh/ganeshMembershipIndex.ts`
- `services/ganesh/ganeshMembership.foundation.test.ts`
- `shared/types/ganesh.ts`
- `firestore.rules` — isActivePandalMemberOf

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
- [ ] Jira KAN-10 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
