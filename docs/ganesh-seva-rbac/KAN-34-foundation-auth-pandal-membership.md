# KAN-34 — Foundation Auth & Pandal Membership

| Field | Value |
| --- | --- |
| Jira | [KAN-34](https://kesavach.atlassian.net/browse/KAN-34) |
| Feature | 01 — Foundation Auth & Pandal Membership |
| Type | Feature |
| Status | In Progress |
| Priority | Medium |
| Project | KAN (Ganesh seva) |
| Parent | [KAN-33](https://kesavach.atlassian.net/browse/KAN-33) |

This file is the implementation brief for this ticket. Do not treat UI permission checks as the security boundary. Firestore Rules (and trusted backend writes) are.

## Ticket

Gap-close on the existing Ganesh foundation. Do not invent a parallel architecture, top-level `invitations/` collection, or top-level `festivals/` collection.

## Live schema

| Ticket name | Actual path |
| --- | --- |
| `users/{uid}` | `users/{uid}` — identity only |
| `pandals/{pandalId}` | same |
| `pandals/{pandalId}/members/{uid}` | same — `active` / `suspended` / `removed` |
| membership index | `users/{uid}/pandalMemberships/{pandalId}` |
| invitations | `pandalInvites/{code}` + `pandalJoinRequests/{pandalId}__{uid}` |
| festivals | `pandals/{pandalId}/festivals/{festivalId}` |

No new composite indexes. Pending stays on join requests, not on `GaneshMemberStatus`.

## Canonical operations

Authoritative import: `services/ganesh/ganeshMembership.ts`

| Ticket name | Implementation |
| --- | --- |
| `getCurrentUser` | `users/{uid}` + `upsertGaneshProfile` |
| `getPandalMembership` | `pandals/{id}/members/{uid}` |
| `createPandal` | `createPandalAndFestival` |
| `createInvitation` | existing Pandal code / `pandalInvites/{code}` |
| `acceptInvitation` | `requestPandalJoin` |
| `leavePandal` | new write — own member → `removed`, last-Admin blocked |
| `updateMemberRole` | `updatePandalMember` |
| `listMyPandals` | `users/{uid}/pandalMemberships` |
| `getCurrentPandal` / `getCurrentFestival` | live docs; session stores ids only |

## Existing code to start from

- `providers/AuthProvider.tsx`
- `app/welcome.tsx`
- `app/(ganesh)/setup.tsx`
- `components/ganesh/GaneshMembershipGate.tsx`
- `services/ganesh/ganeshWrites.ts`
- `firestore.rules` — `isActivePandalMemberOf`

## How to implement

1. Reuse the current membership, join-request, and session model.
2. Keep Expense Tracker and Nutrition Tracker authorization unchanged.
3. Enforce leave and last-Admin in Rules and the write, then add the matching UI.
4. Add emulator tests for unauthenticated, non-member, member, admin, and leave.
5. If `firestore.rules` change, follow `docs/FIREBASE_RULES_DEPLOY.md`.

## Implementation status

- [x] Inspected existing code
- [x] Security boundary implemented (Rules / trusted write)
- [x] Client UX updated
- [x] Tests added
- [ ] Manual verification
- [ ] Jira KAN-34 updated after merge

## Manual testing guide

No new install is required if `npx expo start` is already running; hot reload picks this up. After a rules change, deploy is still manual (`docs/FIREBASE_RULES_DEPLOY.md`).

1. Combined build: open Welcome, pick Expense Tracker, sign in with the existing Google/email session. Confirm Finance still opens without a second OTP.
2. Switch app to Ganesh Seva. Confirm you are not asked for another OTP.
3. New Firebase user with no membership: setup shows Create / Join, not funds.
4. Create a Pandal. Confirm you land in tabs as Admin and see a Pandal code.
5. Second user: join with that code. Confirm they stay on pending copy and cannot open Funds.
6. Admin approves the request. Confirm the second user can open the Pandal.
7. That member: Pandal tab → Leave this Pandal. Confirm they return to setup and Funds is gone.
8. Sole Admin: Leave this Pandal. Confirm it is refused until another Admin is assigned.
9. Logout from Ganesh. Confirm Expense can still sign in with the same Firebase user.

## Notes

- Auth is not Pandal access. Cached `{ pandalId, festivalId }` is not a grant.
- Sole Admin cannot leave until another Admin is assigned (`canLeavePandal` + Rules `keepsAdminCount`).
- Ordinary members cannot update the Pandal document; only their member row, index, and a `left` audit.
- Invite-by-contact stays on KAN-15. Festival CRUD polish stays on KAN-35.
- Expense Tracker auth files were not modified. Typecheck passed. Membership rules emulator: 20/20.
