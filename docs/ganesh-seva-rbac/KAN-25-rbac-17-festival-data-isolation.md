# KAN-25 — RBAC-17 — Festival Data Isolation

| Field | Value |
| --- | --- |
| Jira | [KAN-25](https://kesavach.atlassian.net/browse/KAN-25) |
| Feature | RBAC-17 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:14.551+0530 |
| Updated | 2026-08-31T14:33:10.609+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Prevent data from different Festival years from being mixed, while allowing authorized historical viewing.

## Implementation

Validate every Festival belongs to the current Pandal. All Festival child records must reference the correct Festival and Pandal. Current Festival selection is application context only and never a security credential. Historical/settled Festivals may be read according to permissions but must respect lock state.

## Security

Reject forged festivalId, cross-Pandal Festival references, moving records between Festivals, and writes to settled Festivals without explicit correction permission.

## Data Integrity

Dashboard queries and financial totals must always include the intended Festival scope; Permanent Fund is explicitly separate from year-specific Festival funds.

## Tests

Create 2026/2027 Festivals and two Pandals; test cross-year reads, writes, aggregate queries, forged IDs and settled records.

## Done

Festival boundaries are enforced server-side and multi-year regression tests prevent accidental mixing.

## Existing code to start from

- `services/ganesh/ganeshFestivalGuard.ts`
- `firestore.rules (festival parent validation)`
- `shared/utils/ganeshPaths.ts`

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
- [ ] Jira KAN-25 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
