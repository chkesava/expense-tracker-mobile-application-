# KAN-31 — RBAC-23 — Critical Action Approval Controls

| Field | Value |
| --- | --- |
| Jira | [KAN-31](https://kesavach.atlassian.net/browse/KAN-31) |
| Feature | RBAC-23 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:23:06.797+0530 |
| Updated | 2026-08-31T14:33:57.596+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Protect high-impact operations with explicit approval/confirmation controls, especially when mistakes could materially affect Festival finances or administration.

## Implementation

Define configurable approval-required actions such as large Permanent Fund transfers, major expense voids, Admin changes and settlement lock/unlock. Approval state must be server-authoritative and tied to a specific intended operation, actor and target.

## Security

A user must first have the base permission. Approval cannot grant a permission the user does not have. Do not accept a client-supplied `approved=true`. Prevent replaying an approval against a different amount, target or operation.

## UX

Use a clear review screen showing amount, source/destination, target user or record and consequences. Require explicit confirmation and prevent double submission.

## Concurrency

Use transaction/idempotency controls so approval cannot execute the same financial operation twice.

## Tests

Unauthorized approval, forged approval, changed amount after approval, replay, timeout/cancel, concurrent execution and audit verification.

## Done

Critical operations require the configured approval path and every approval/execution is auditable.

## Existing code to start from

- `hooks/useGaneshWrites.ts`
- `app/(ganesh)/close-festival.tsx`
- `services/ganesh/ganeshPermanentFund.ts`

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
- [ ] Jira KAN-31 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
