# KAN-16 — RBAC-08 — Financial Permission Separation

| Field | Value |
| --- | --- |
| Jira | [KAN-16](https://kesavach.atlassian.net/browse/KAN-16) |
| Feature | RBAC-08 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:04.814+0530 |
| Updated | 2026-08-31T14:31:55.614+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Separate financial capabilities so ordinary volunteers can perform assigned work without unrestricted control of money.

## Implementation

Define explicit permissions for viewing, creating, editing, voiding, reconciling, cash handover, reimbursements, fund transfers and Festival settlement. Apply them to God Fund, Personal Money and Permanent Fund operations. Keep view permission independent from write permission.

## Security

Sensitive operations must be rejected by Firestore/trusted backend authorization even if the UI is bypassed. Never authorize based solely on screen visibility. Protect financial ownership/fund fields from client tampering.

## Concurrency

Use atomic/transactional operations for balance-affecting writes. Ensure retries cannot duplicate money.

## Tests

Matrix-test each role against every financial action, including forged fund type, amount, owner, Pandal/Festival and direct writes.

## Done

Every financial mutation has an explicit permission, immutable audit event and deterministic authorization behavior.

## Existing code to start from

- `shared/utils/ganeshPermissionRegistry.ts`
- `hooks/useGaneshWrites.ts`
- `services/ganesh/ganeshWrites.ts`
- `services/ganesh/ganeshPermanentFund.ts`
- `services/ganesh/ganeshVoid.write.test.ts`

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
- [ ] Jira KAN-16 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
