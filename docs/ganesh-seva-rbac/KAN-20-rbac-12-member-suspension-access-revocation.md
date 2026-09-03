# KAN-20 — RBAC-12 — Member Suspension & Access Revocation

| Field | Value |
| --- | --- |
| Jira | [KAN-20](https://kesavach.atlassian.net/browse/KAN-20) |
| Feature | RBAC-12 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:33.862+0530 |
| Updated | 2026-08-31T14:32:29.420+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Safely suspend/remove members while preserving their historical contributions, collections, expenses and audit records.

## Implementation

Add controlled ACTIVE → SUSPENDED/REMOVED transitions and optional restoration rules. Immediately deny protected access for suspended/removed users while retaining ownership/history on existing records. Prevent suspended users from creating offline queued writes that later bypass current authorization.

## Security

Only authorized membership-management users can change status. Status is server-authoritative and cannot be changed by the member. Existing records must not be reassigned merely because access was revoked.

## UX

Admin member detail shows current status, reason where appropriate, date and available actions. Dangerous changes require confirmation.

## Tests

Suspend active user, attempt read/write, restore, remove, offline write after suspension, direct status forgery and concurrent status changes.

## Done

Access revocation is immediate on subsequent authorization checks, history remains intact and transitions are audited.

## Existing code to start from

- `hooks/usePandalMembers.ts`
- `services/ganesh/ganeshMembershipIndex.ts`
- `firestore.rules` — isActivePandalMemberOf
- `app/(ganesh)/member/[id].tsx`

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
- [ ] Jira KAN-20 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
