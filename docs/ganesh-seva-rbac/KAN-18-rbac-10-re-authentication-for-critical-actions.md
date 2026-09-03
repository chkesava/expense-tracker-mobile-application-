# KAN-18 — RBAC-10 — Re-authentication for Critical Actions

| Field | Value |
| --- | --- |
| Jira | [KAN-18](https://kesavach.atlassian.net/browse/KAN-18) |
| Feature | RBAC-10 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:18.931+0530 |
| Updated | 2026-08-31T14:32:12.754+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Protect high-impact actions with recent Firebase authentication without creating a second login system.

## Actions

Evaluate Admin transfer, Permanent Fund transfer, major financial voids, settlement lock/unlock and other configurable critical operations.

## Implementation

Use Firebase Auth reauthentication supported by the existing sign-in provider. Define a reusable `requireRecentAuthentication()` guard. Trigger it immediately before the critical mutation, not only when opening a screen. Failed/cancelled/stale authentication must stop the operation.

## Security

Reauthentication is an additional control, not a replacement for RBAC or Firestore authorization. Never store passwords, tokens or authentication secrets in Firestore.

## UX

Explain why reauthentication is required, preserve entered form data safely where possible, and prevent accidental duplicate submissions.

## Tests

Test stale session, failed reauth, cancellation, successful reauth followed by unauthorized permission, and repeated/replayed critical requests.

## Done

Critical actions require both effective permission and recent authentication and produce audit events.

## Existing code to start from

- `app/(auth)/login.tsx`
- `docs/GOOGLE_AUTH_BRIDGE.md`
- `hooks/useGaneshWrites.ts`

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
- [ ] Jira KAN-18 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
