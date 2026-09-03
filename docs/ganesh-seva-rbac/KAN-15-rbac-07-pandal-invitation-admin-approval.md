# KAN-15 — RBAC-07 — Pandal Invitation & Admin Approval

| Field | Value |
| --- | --- |
| Jira | [KAN-15](https://kesavach.atlassian.net/browse/KAN-15) |
| Feature | RBAC-07 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:56.958+0530 |
| Updated | 2026-08-31T14:31:46.734+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Create a secure invitation and Admin approval workflow. Firebase login proves identity but does not grant Pandal access.

## Implementation

Define invitation/request records with target Pandal, target user identity, invited role, inviter, timestamps and lifecycle status. Admin creates invitation; recipient sees pending invitation; only authorized Admin can approve/reject. Approval must atomically activate membership and assign only the approved role.

## Security

Never grant access merely because a user knows an invitation ID or Pandal ID. Validate target identity, invitation status, expiry and Pandal scope. Prevent invitation reuse and role tampering. Client cannot approve itself.

## UX

Provide clear pending/accepted/rejected states and Admin review controls. Already-authenticated Google/email users should not receive a second Ganesh-specific OTP.

## Tests

Test unauthorized approval, forged target UID, forged role, cross-Pandal invitation, duplicate approval, revoked invitation and simultaneous approval.

## Done

Invitation approval results in exactly one valid membership state, role is server-authorized, and every transition is audited.

## Existing code to start from

- `app/(ganesh)/join-requests.tsx`
- `firestore.rules` — pandalInvites
- `ganesh seva future ideas/GANESH_SEVA_AUDIT_TICKETS.md (GS-002, GS-003)`

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
- [ ] Jira KAN-15 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
