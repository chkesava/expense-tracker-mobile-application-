# KAN-21 — RBAC-13 — Invitation Expiry & Revocation

| Field | Value |
| --- | --- |
| Jira | [KAN-21](https://kesavach.atlassian.net/browse/KAN-21) |
| Feature | RBAC-13 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:41.233+0530 |
| Updated | 2026-08-31T14:32:37.549+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Prevent stale invitations from granting access indefinitely.

## Implementation

Store invitation creation time, expiry time, status, target identity, Pandal, invited role and inviter. Define valid acceptance conditions and reject expired/revoked/used invitations. Admin can revoke pending invitations. Acceptance must be atomic and one-time.

## Security

Do not treat an invitation ID as authorization. Validate target Firebase UID/email identity as appropriate, Pandal scope, status and expiry. Client cannot extend expiry or change the invited role.

## UX

Show pending, expired, revoked and accepted states with clear Admin controls.

## Tests

Expired acceptance, revoked acceptance, duplicate acceptance, forged target, forged role, cross-Pandal invite and simultaneous acceptance.

## Done

Invitation lifecycle is deterministic, secure and auditable.

## Existing code to start from

- `app/(ganesh)/join-requests.tsx`
- `firestore.rules` — pandalInvites

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
- [ ] Jira KAN-21 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
