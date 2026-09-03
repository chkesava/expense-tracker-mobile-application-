# KAN-30 — RBAC-22 — Sensitive Data Visibility Permissions

| Field | Value |
| --- | --- |
| Jira | [KAN-30](https://kesavach.atlassian.net/browse/KAN-30) |
| Feature | RBAC-22 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:56.691+0530 |
| Updated | 2026-08-31T14:33:49.513+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Restrict sensitive personal and financial fields independently from general record access.

## Implementation

Inventory sensitive data such as donor phone numbers, detailed Personal Money/reimbursement details, finance balances and audit metadata. Decide whether each field requires a separate permission or should be split into protected documents. Avoid fetching data the user cannot view.

## Security

Field hiding in React Native is insufficient. Firestore document/collection structure must permit Rules to enforce the intended boundary. Never expose phone numbers or sensitive financial details through broad documents when unauthorized members can read them.

## UX

Show masked/limited information when appropriate and explain restricted fields without leaking their values.

## Tests

Authorized/unauthorized reads, query behavior, direct document access, offline cache exposure and screenshot/log review for sensitive data.

## Done

Sensitive data has explicit visibility rules and unauthorized users cannot retrieve it through UI, Firestore calls or predictable document paths.

## Existing code to start from

- `shared/utils/ganeshPermissionRegistry.ts`
- `app/(ganesh)/(tabs)/contributions.tsx`
- `app/(ganesh)/admin/reports.tsx`

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
- [ ] Jira KAN-30 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
