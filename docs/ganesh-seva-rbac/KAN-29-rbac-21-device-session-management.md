# KAN-29 — RBAC-21 — Device & Session Management

| Field | Value |
| --- | --- |
| Jira | [KAN-29](https://kesavach.atlassian.net/browse/KAN-29) |
| Feature | RBAC-21 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:22:47.437+0530 |
| Updated | 2026-08-31T14:33:41.582+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Provide practical device/session controls without building a second authentication system.

## Implementation

Use Firebase-supported session/auth behavior. Where technically available, expose recognizable current/recent sign-ins and a revoke/sign-out path. Add lost-device guidance and ensure membership suspension/RBAC changes remove practical Pandal access.

## Security

Never store Firebase credentials, refresh tokens or secrets in Firestore. Do not implement custom password/session storage. Sensitive actions still require RBAC and reauthentication where configured.

## UX

Settings should show device/session information only when reliable, with clear sign-out/revoke confirmation and recovery guidance.

## Tests

Multiple devices, sign-out, revoked membership, stale session, sensitive action after revocation and token/credential exposure review.

## Done

Session handling uses Firebase primitives, does not leak credentials, and integrates with membership/RBAC revocation.

## Existing code to start from

- `app/(auth)/login.tsx`
- `docs/GOOGLE_AUTH_BRIDGE.md`

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
- [ ] Jira KAN-29 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
