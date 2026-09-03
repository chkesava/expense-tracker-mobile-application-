# KAN-17 — RBAC-09 — RBAC & Permission Change Audit

| Field | Value |
| --- | --- |
| Jira | [KAN-17](https://kesavach.atlassian.net/browse/KAN-17) |
| Feature | RBAC-09 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:11.774+0530 |
| Updated | 2026-08-31T14:32:04.355+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Create an immutable security audit trail for every RBAC and membership authorization change.

## Implementation

Standardize audit events with actor UID, Pandal/Festival context, action, target type/ID, timestamp, outcome and safe before/after metadata. Cover role creation/edit/delete, permission changes, role assignment/removal, Admin changes, invitations, approvals, suspension and restoration.

## Security

Clients must not be able to forge actor identity, rewrite history or delete audit events. Never store passwords, tokens, secrets or unnecessary sensitive personal data.

## Reliability

Audit creation should be atomic with the protected business mutation where practical; define behavior if audit persistence fails. Avoid duplicate events on retries.

## UX

Authorized Admins get filterable history with useful human-readable actions and target context.

## Tests

Verify actor identity, immutable records, unauthorized reads/writes, concurrent changes and audit coverage for every privileged operation.

## Done

All RBAC mutations produce trustworthy audit evidence and the audit collection is protected independently.

## Existing code to start from

- `app/(ganesh)/admin/audit.tsx`
- `firestore.rules` — auditLogs
- `ganesh seva future ideas/15-audit-and-activity-timeline.md`

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
- [ ] Jira KAN-17 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
