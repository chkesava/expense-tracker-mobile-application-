# KAN-32 — RBAC-24 — Security Monitoring & Emergency Controls

| Field | Value |
| --- | --- |
| Jira | [KAN-32](https://kesavach.atlassian.net/browse/KAN-32) |
| Feature | RBAC-24 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:23:15.778+0530 |
| Updated | 2026-08-31T14:34:07.206+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Provide lightweight security monitoring and emergency controls suitable for the Ganesh Seva POC without introducing expensive enterprise infrastructure.

## Implementation

Reuse the centralized Audit Trail and RBAC systems. Create an Admin security view showing recent critical events: role/permission changes, Admin transfers, member suspension/removal, invitation anomalies, critical financial actions and authorization failures where available. Provide an emergency member-suspension action for authorized Admins.

## Security

Emergency controls must themselves require explicit permission and be audited. Do not create secret bypass accounts, hidden master passwords or client-only emergency switches. Never store tokens, credentials or secrets in monitoring data.

## UX

Show severity, actor, target, time and action. Make emergency suspension fast but require confirmation. Clearly distinguish informational events from high-risk events.

## Performance/Cost

Use indexed, bounded audit queries and pagination; do not continuously read the entire audit collection or poll aggressively. Keep the design compatible with Firebase free/low-cost usage.

## Tests

Verify unauthorized monitoring access, emergency action authorization, cross-Pandal isolation, audit integrity, rapid suspension, stale UI permissions and repeated emergency actions.

## Done

Admins can identify important security events and quickly revoke a compromised member without bypassing the normal authorization architecture.

## Existing code to start from

- `app/(ganesh)/admin/audit.tsx`
- `firestore.rules` — auditLogs

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
- [ ] Jira KAN-32 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
