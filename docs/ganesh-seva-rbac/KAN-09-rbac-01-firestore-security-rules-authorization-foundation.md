# KAN-9 — RBAC-01 — Firestore Security Rules & Authorization Foundation

| Field | Value |
| --- | --- |
| Jira | [KAN-9](https://kesavach.atlassian.net/browse/KAN-9) |
| Feature | RBAC-01 |
| Type | Feature |
| Status | To Do |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Created | 2026-08-31T13:20:05.462+0530 |
| Updated | 2026-08-31T14:30:52.217+0530 |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

## Objective

Establish the non-bypassable authorization foundation for Ganesh Seva using Firebase Auth identity + Pandal membership + RBAC + Firestore Security Rules.

## Implementation Plan

1. Inspect existing Auth, Firestore collections, membership model and current Ganesh Seva guards before changing code.
2. Define one canonical authorization context: authenticated UID, Pandal membership, membership status, assigned roles, effective permissions and selected Festival.
3. Create reusable Security Rules helper functions for authentication, active membership, Pandal ownership/scope, role/permission checks and Festival-parent validation.
4. Ensure every protected collection is explicitly covered; do not rely on client navigation guards.
5. Reject writes that attempt to change trusted fields such as userId, pandalId, festivalId, role, permissions, membership status or audit metadata.
6. Add deny-by-default behavior for unknown/new collections.
7. Add emulator/security-rule tests before considering the foundation complete.

## Security Requirements

* Unauthenticated users: deny.
* Pending/suspended/removed members: deny protected Pandal access.
* Cross-Pandal reads/writes: deny.
* Client-provided authorization claims are never trusted.
* UI permission checks are convenience only; Firestore Rules are the security boundary.
* Preserve the separate Expense Tracker application and existing authentication.

## Data/Architecture Guidance

Use the existing schema where possible. Do not introduce enterprise multi-tenant infrastructure. Centralize permission identifiers and avoid duplicated authorization logic. Prefer small, testable helpers over giant rules.

## Attack/Test Cases

Test unauthenticated access, forged pandalId/festivalId, forged userId, self-role escalation, cross-Pandal read/create/update/delete, inactive membership, and direct Firestore requests bypassing the UI.

## Definition of Done

Rules deployed successfully, emulator tests cover allow/deny paths, no sensitive collection remains unprotected, and a security review confirms authorization cannot be bypassed through client state.

## Existing code to start from

- `firestore.rules`
- `shared/utils/ganeshPermissions.ts`
- `shared/utils/ganeshPermissions.rules.contract.test.ts`
- `docs/FIREBASE_RULES_DEPLOY.md`
- `docs/GANESH_STORAGE_LOCKDOWN.md`

## How to implement

1. Read this ticket and the related files above before writing code.
2. Reuse the current Ganesh membership, role, and permission model. Do not invent a parallel RBAC system.
3. Keep Expense Tracker and Nutrition Tracker authorization unchanged.
4. Enforce the rule in Firestore / trusted writes first, then hide or disable the matching UI.
5. Add or extend tests for allow and deny paths, including direct Firestore access that bypasses the UI.
6. If `firestore.rules` change, follow `docs/FIREBASE_RULES_DEPLOY.md`.
7. After shipping, update this file's **Implementation status** and the Jira ticket.

## Implementation status

- [x] Inspected existing code
- [x] Security boundary implemented (Rules / trusted write)
- [x] Client UX updated
- [x] Tests added
- [x] Manual verification
- [x] Jira KAN-9 updated

## Notes

KAN-9 closed the remaining foundation gaps on top of the existing Ganesh rules (do not rewrite `firestore.rules`).

- Canonical client context: `shared/utils/ganeshAuthorization.ts` + `useGaneshPermissions`. UI `can()` is still convenience only.
- Owner writes on `users/{uid}/pandalMemberships/{pandalId}` must match the live member doc and the GS-084 field allowlist. The recursive `users/{uid}/**` owner grant now excludes `pandalMemberships` because nested matches OR together.
- `scopeIdsMatch()` refuses redundant `pandalId` / `festivalId` that disagree with the path. `festivalYears` create requires the named festival to exist.
- Emulator coverage: `firestore/ganeshFoundation.rules.test.ts` (KAN-9 attack list). Full collection matrix stays on KAN-23.
- Expense / Nutrition `users/{uid}` personal-data rules are unchanged except the `pandalMemberships` exclusion.
- Rules are not deployed by CI. After review, deploy manually per `docs/FIREBASE_RULES_DEPLOY.md`.
