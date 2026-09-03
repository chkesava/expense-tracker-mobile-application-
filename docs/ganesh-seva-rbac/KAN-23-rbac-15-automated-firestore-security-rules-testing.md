# KAN-23 — RBAC-15 — Automated Firestore Security Rules Testing

| Field | Value |
| --- | --- |
| Jira | [KAN-23](https://kesavach.atlassian.net/browse/KAN-23) |
| Feature | RBAC-15 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:57.020+0530 |
| Updated | 2026-08-31T14:32:54.275+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Build automated Firestore Security Rules tests so authorization regressions cannot silently reach production.

## Implementation

Use the Firebase Emulator Suite/rules-test framework compatible with the project. Create reusable authenticated contexts for anonymous, active member, pending, suspended, removed, Admin, Treasurer and Volunteer/custom roles. Test every protected collection and important operation.

## Required Cases

Unauthenticated deny; active allow when permission exists; missing permission deny; own-vs-all; cross-Pandal deny; cross-Festival deny; self-role escalation deny; forged ownership deny; audit modification deny; locked-record mutation deny; unauthorized financial actions deny.

## CI/Developer Experience

Tests must be repeatable locally and runnable in CI without production data. Add fixtures that represent realistic Pandal/Festival relationships.

## Done

Security rules have regression coverage for both positive and negative paths, with no test depending only on UI behavior.

## Existing code to start from

- `shared/utils/ganeshPermissions.rules.contract.test.ts`
- `firestore.rules`
- `docs/FIREBASE_RULES_DEPLOY.md`

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
- [ ] Jira KAN-23 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
