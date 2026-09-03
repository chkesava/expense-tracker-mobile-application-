# KAN-19 — RBAC-11 — Financial & Festival Record Locking

| Field | Value |
| --- | --- |
| Jira | [KAN-19](https://kesavach.atlassian.net/browse/KAN-19) |
| Feature | RBAC-11 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:21:27.144+0530 |
| Updated | 2026-08-31T14:32:20.704+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Lock finalized Festival and financial records so historical numbers cannot be silently changed.

## Implementation

Introduce explicit Festival lifecycle/lock state and determine which child financial records become immutable after settlement. Normal users cannot edit/delete locked records. Provide a controlled correction/unlock permission for exceptional cases.

## Security

Lock state itself is protected. Client cannot simply change `locked=false`. Corrections require authorization, recent authentication where configured, and an audit event.

## Data Integrity

Prefer immutable transactions/void-and-replace over destructive edits for finalized financial data. Preserve settlement history and Permanent Fund transfers.

## UX

Show clear locked badges, disable unavailable actions and explain correction workflow.

## Tests

Attempt edits/deletes after lock, forged lock state, unauthorized unlock, concurrent settlement/edit and authorized correction.

## Done

Settlement creates a reliable immutable boundary and all exceptional changes are traceable.

## Existing code to start from

- `services/ganesh/ganeshFestivalGuard.ts`
- `app/(ganesh)/close-festival.tsx`
- `firestore.rules (closed-festival read-only)`
- `ganesh seva future ideas/GANESH_SEVA_AUDIT_TICKETS.md (GS-018, GS-019)`

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
- [ ] Jira KAN-19 updated

## Notes

_Add implementation notes, decisions, and leftovers here while building this ticket._
