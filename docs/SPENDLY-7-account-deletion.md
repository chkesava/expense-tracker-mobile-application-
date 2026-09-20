# SPENDLY-7 — deleting an account that three apps share

[SPENDLY-7](https://kesavach.atlassian.net/browse/SPENDLY-7) · Bug ·
Medium / Security + Compliance · epic
[SPENDLY-2](https://kesavach.atlassian.net/browse/SPENDLY-2)

Audit row **AUTH-06** in
[`SPENDLY_FIREBASE_AUDIT_2026-09-12.md`](SPENDLY_FIREBASE_AUDIT_2026-09-12.md).

Shipped in three parts: **7a** removed the dead Google web bridge (see
[`LEGACY_WEB_BRIDGE_DECOMMISSION.md`](LEGACY_WEB_BRIDGE_DECOMMISSION.md)), **7b**
added `lib/reauthenticate.ts`, and **7c** is the deletion itself.

---

## The thing the ticket did not say

"Delete my account" cannot be scoped to Spendly. One Firebase user serves all
three products, and the data sits in three different places:

| Product | Where it lives | What deletion does |
|---|---|---|
| Spendly | `users/{uid}/**` | Deleted |
| Nutrition | **also `users/{uid}/**`** — `daily_logs`, `profile/nutrition`, `goals/nutrition`, `weight_history` | Deleted, unavoidably |
| Ganesh Seva | `pandals/{id}/**`, outside the user tree | Membership marked `removed`; the Pandal's records stay |

So the confirm screen names all three in plain words. A user deleting their
Spendly account and silently losing a year of food logs would be the worst
possible outcome of a privacy feature.

Two more things nobody's scope included:

- **`users/{uid}_duress`.** The SPENDLY-22 decoy tree is real data and gets its
  own phase. Leaving it behind would have stranded arguably the most sensitive
  thing in the account.
- **Ganesh member doc ids are not reliably the uid.** The self-join branch pins
  `memberId == request.auth.uid`, but the `canManageMembers()` create branch
  (`firestore.rules:1305-1310`) does not — an admin adding someone else cannot
  use their own uid as the doc id. Enumerating by id would silently miss
  people, so the function queries `where("userId", "==", uid)` instead. **That
  needs the `members.userId` collection-group override in
  `firestore.indexes.json`, deployed before the function**, or the query throws
  `FAILED_PRECONDITION` at runtime and only at runtime.

## Five phases, and why they are in this order

`netlify/functions/delete-account.ts` runs **one phase per invocation**;
`services/deleteAccountClient.ts` loops until `done`.

| # | Phase | Work |
|---|---|---|
| 1 | `shared` | `splits`, `paymentRequests`, `splitPublicShares` where `createdBy == uid`; owned `vaults` + their `expenses` |
| 2 | `ganesh` | every `pandals/*/members/*` with `userId == uid` → marked `removed`, with an audit row |
| 3 | `user-tree` | `users/{uid}` — one subcollection per pass, then the document |
| 4 | `duress-tree` | `users/{uid}_duress` |
| 5 | `auth` | `deleteUser(uid)` |

**`auth` is last** because it is the one irreversible, non-retryable step. Once
the Firebase Auth user is gone the client can never mint another ID token, so
the function can never again be authorised to finish — any residue would be
orphaned permanently with no operator-free way to reach it. Every earlier phase,
if it dies, leaves a still-signed-in user who can press the button again.

**`shared` is first** because those are the only documents *other people* can
see. If deletion stalls forever after phase one, the friend-visible splits
carrying this person's name, photo and UPI id are gone and only their own
private data remains. That is the right way round.

### Why it is phased at all

Netlify's synchronous functions cap at 10s and `recursiveDelete` has no cursor,
so a large account cannot be deleted in one call. The tree phases use
`listCollections()` as the cursor, which is **self-healing**: a subcollection
emptied by a previous invocation simply is not in the next listing, so resume
needs no bookkeeping document and no "deletedAt" marker.

`recursiveDelete` is **monotonic** — what it removed before being cut off stays
removed — so a timeout is an ordinary retry that converges, not a corrupted
half-state. The query phases re-run the same query each pass, since deleted
documents drop out of the result set.

## Decisions worth keeping

**Re-auth is enforced server-side.** The function reads `auth_time` from the
verified ID token and refuses anything older than five minutes.
`lib/reauthenticate.ts` is the prompt; this is the gate. A tampered client skips
every prompt, but cannot forge `auth_time` — Firebase stamps it when a
credential is presented.

**The uid comes from the verified token, never the body.** The Admin SDK
bypasses `firestore.rules` entirely, so `verifyIdToken` *is* the whole
authorization model here. Uids are visible to co-participants through
`splits.participantIds` and Pandal member lists, so a body-supplied uid would
let any signed-in account delete any other.

**Shared documents are deleted, not orphaned.** `createdBy` is immutable and
only the creator may update or delete, so a split outliving its creator can
never be settled or removed by anyone left in it.
`firestore/accountDeletion.rules.test.ts` pins that: a participant cannot delete
the split, and cannot take it over by rewriting `createdBy`.

**Ganesh membership is marked `removed`, never deleted.** `allow delete: if
false` on member docs, and the Pandal's collections and expenses reference the
member through `collectorId` while `memberAudits` rows name them. Deleting the
member would break the ledger for a committee that is not deleting anything.
The audit row reuses the existing `left` action so `memberAuditLine()` renders
it unchanged; the `reason` carries the nuance.

> **This is a deliberate exception to "delete everything", and it belongs in the
> privacy policy.** A Pandal's history keeps the departed member's name on
> entries they recorded. The confirm screen says so.

**The last admin may leave, and the Pandal is flagged.** `canLeavePandal`
refuses this, rightly, for an ordinary departure. But a Play-policy obligation
cannot be held hostage by someone else's committee needing an admin. So the
Pandal gets `needsAdmin: true`, the id is returned in `orphanedPandals`, and the
user is warned before they confirm. **How an admin-less Pandal recovers is not
defined anywhere in this codebase and was not invented here** — follow-up
ticket.

**A poisoned document cannot make an account undeletable.** `BulkWriter`'s
default gives up after five attempts and throws, taking the phase with it.
Instead `onWriteError` records the path and continues; `failedPaths` comes back
in the response. "One of your documents is wedged" is not an answer Play policy
accepts.

**Vaults with more than one member are skipped and reported.** Impossible today
— `keepsOwnershipStable()` freezes `memberIds` after a create that requires
`[self]` — but the day an invite flow ships, silently destroying someone else's
vault would be far worse than leaving a row for an operator to look at.

**The screen is a root-level route.** Navigating to `app/delete-account.tsx`
unmounts `(app)`, `(ganesh)` and `(nutrition)` and every `onSnapshot` they hold.
Otherwise the moment deletion starts, dozens of live listeners fire
`permission-denied` into `logError` while the user watches half-empty screens
repaint. One route also serves all three products, which is what Play requires —
each ships as its own listing, so each needs a reachable in-app path.

**Duress mode cannot reach it.** The entry points are hidden, and the screen
itself redirects. Hiding a control is never the guard that matters.

**Local cleanup clears what `logout()` deliberately leaves.** The SPENDLY-22
SecureStore keys (`spendly.privacy.pin.v1.*`, `spendly.privacy.lockout.v1.*`)
survive sign-out on purpose, so a PIN outlives a re-login on the same device.
Deletion is a different event: there is no account left to protect, and stale
secret material on a shared device is worth nothing to anyone. Cleared here and
**not** in `logout()` — sharing that code would need a flag, which is how the
lockout-reset bug gets reintroduced.

**On failure, the reassurance leads.** "Your account is still active — try
again" comes before the server's own message, and the user is never signed out
on a failed run: they need the session to retry. Never claim success on a
partial run.

## Files

| File | |
|---|---|
| `shared/utils/deleteAccountRemote.ts` *(new)* | The HTTP contract, phase ordering, `isReauthFresh`, request parsing |
| `shared/utils/ganeshAccountRemoval.ts` *(new)* | The membership decision, pure |
| `netlify/functions/delete-account.ts` *(new)* | The Admin SDK work |
| `services/deleteAccountClient.ts` *(new)* | The retry/resume loop |
| `app/delete-account.tsx` *(new)* | Confirm → re-auth → run |
| `components/settings/sections/ProfileSection.tsx`, `app/(nutrition)/profile.tsx`, `components/ganesh/pandal/PandalAccountBar.tsx` | Entry points, all duress-guarded |
| `firestore.indexes.json` | `members.userId` collection-group override |
| `scripts/bundle-netlify-fns.js`, `.github/workflows/web-deploy.yml` | Bundle + load-check the new function |

## Tests

| File | |
|---|---|
| `shared/utils/deleteAccountRemote.test.ts` *(new)* | 22 — phase ordering with `auth` last, the freshness window and its boundaries, request parsing |
| `shared/utils/ganeshAccountRemoval.test.ts` *(new)* | 9 — last admin, suspended admin, already-removed idempotency |
| `services/deleteAccountClient.test.ts` *(new)* | 12 — the loop, retry budget, `reauth-required` as non-retryable, never claiming success |
| `firestore/accountDeletion.rules.test.ts` *(new)* | 8 — what a client provably cannot do, which is why the function exists |

**3006 unit + 354 rules**, both typechecks clean, all three web targets export,
and the CJS load check passes. Local smoke test of the deployed shape: no token
→ 401, `GET` → 405, `OPTIONS` → 204.

## Manual testing — required before this is trusted

There is no auth emulator in `npm run test:rules` and the Admin SDK path is
unreachable from vitest, so **the deletion itself has never been executed**.
Before relying on it:

1. Create a throwaway account. Seed it with: a split shared with a second
   account, a vault with expenses, a Nutrition food log and weight entry, a
   duress PIN with some decoy data, and membership of two Pandals — one as sole
   admin, one alongside another admin.
2. Delete it. Watch the phases progress.
3. From the **second** account, confirm the shared split is gone.
4. Confirm the sole-admin Pandal shows `needsAdmin` and an audit row, the other
   Pandal's `adminCount` decremented, and both member rows read `removed` with
   the name intact.
5. Confirm `users/{uid}` and `users/{uid}_duress` are both gone from the console.
6. Confirm signing in again is refused.
7. Re-auth on each provider: password, Google native, Google web. A phone
   account should be told to sign out and back in.
8. Reach the screen from all three products; confirm duress mode cannot.

## Known limitations

1. **Never executed end to end.** See above. This is the big one.
2. **Timeout behaviour on a genuinely large account is unmeasured** — the
   `elapsedMs` field exists for exactly this.
3. **A Pandal can be left with no admin** and no defined recovery. Follow-up.
4. **Supabase Storage files are not deleted.** `services/ganesh/storage/` uses a
   different credential; reaching it would put a second service's failure mode
   inside the deletion path. Follow-up.
5. **Denormalised identity survives on other people's documents** — Pandal audit
   rows (on purpose), and `splits.participants[]` on splits created *by others*,
   which are not this user's to delete. Needs a privacy-policy answer.
6. **Re-auth before PIN/UPI changes was deferred**, with reasons, to a
   follow-up: the PIN already requires the current PIN, and the UPI id is a
   display string rather than a payment authorization.
