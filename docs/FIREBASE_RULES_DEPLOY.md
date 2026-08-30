# Firestore rules and indexes — manual deploy

`firestore.rules` and `firestore.indexes.json` live at the repo root as the
reference source of truth. `storage.rules` covers the signed APK objects used
by in-app updates. None of these files are deployed automatically: CI only runs
the type checks and the test suite, and the Android release workflow never
touches Firebase rules. Deploying is a deliberate manual step.

## Why these files exist

Before Borrowings and Spending Spaces, the rules lived only in the Firebase
console and there was no versioned copy of them. That made it impossible to
review a rules change alongside the code change that needed it. These two files
close that gap. Treat the console as downstream of this repo — if you change a
rule in the console, mirror it here in the same pull request.

### This repo owns the deploy

The sibling Vite web app (`expense-tracker`) ships its own, incompatible
`firestore.rules` against the same Firebase project, so only one of the two can
be live. **The deployed rules are this repo's.** Established on 2026-08-22 by
observation, not assumption: an anonymous client reads `splitPublicShares`
successfully (which the Vite file does not permit at all), and both mobile write
paths mint auto-ids while the Vite file requires `resource.data.slug == <docId>`
on `paymentRequests`, which would deny every payment request the app creates.

Do not deploy the Vite repo's rules over these. It defines an `isSuperAdmin()`
model this repo does not have, and this file's `system_settings/global` clause is
wider than that repo's — deploying either wholesale over the other changes who
can write what. Reconcile them deliberately if the web app is ever revived.

## What they cover

`firestore.rules` confines everything under `users/{uid}/...` to its owner,
including the three collections this feature adds:
`users/{uid}/borrowings`, `users/{uid}/borrowingRepayments` and
`users/{uid}/spaces`. Duress mode writes to `<uid>_duress`, so the ownership
helper accepts the auth uid and that uid with the duress suffix — the contract
asserted by `lib/duressPath.contract.test.ts`. The shared `vaults`, `splits` and
`paymentRequests` collections keep their member-based access. Public split
pages use a world-readable `splitPublicShares` snapshot (creator-only writes);
the private `splits` collection is not opened to the world.

`splitShareClaims` is the one collection that accepts an **unauthenticated
write** — a self-service update filed from `/split/:slug` by someone with no
account. It is readable by exact document id and `list` is denied, so the
collection cannot be enumerated. `create` is the only anonymous verb, and the
document id must equal `{shareId}__{participantKey}`, which bounds an anonymous
writer to one claim slot per person per split: an existing document turns a
client `setDoc` into an `update`, which is refused, and anonymous `delete` is
refused so the slot cannot be re-armed. Each create also re-reads the parent
share and requires `claimsEnabled == true`, a matching slug, the participant key
to be listed in `claimKeys`, and the split not to be settled or spent. A claim
changes nothing on its own; the organizer applies it with their own credentials.
`shared/utils/splitClaims.rules.contract.test.ts` mirrors these clauses by hand
(there is no emulator in CI) and must be updated alongside them. No new indexes
are needed, because closing `list` means there are no queries on it.

The full reasoning, and the residual risk that is accepted rather than solved,
is in `docs/audits/SPLIT_SHARE_LINK_AUDIT_2026-08-22.md`.

The Ganesh Seva section confines every Pandal and Festival document to an
**active** membership — `ownerId` or `memberIds` alone grant nothing. Three
clauses there are easy to break by accident, so they are mirrored by hand in
`shared/utils/ganeshPermissions.rules.contract.test.ts` and must be updated
alongside the rules. `pandalInvites` is `get`-only with `list` denied, because a
join code is a bearer secret and `read` would let any signed-in account
enumerate every Pandal in the project. The `members/{memberId}` open-join
self-create pins `permissions` to `builtinMemberPermissions()` and `roleIds` to
`['member']` — that array is what `hasPermOf()` reads to authorize every later
action, so a self-created membership must not be able to name its own
privileges; the literal in the rules is asserted equal to
`expandPermissions(ROLE_PERMISSIONS.member)` by that test. And because nested
matches OR together, `fundTransfers` and `auditLogs` are excluded from the
festival wildcard's `update` and `delete` inside the wildcard itself — the
explicit `allow update, delete: if false` on `fundTransfers` cannot subtract a
grant the wildcard makes.

Three more Ganesh clauses are load-bearing and easy to undo by accident. A closed
festival is **read-only** — both `update` branches of the festival wildcard require
`festivalOpen()`, and `allow delete` is `false` for every ledger subcollection,
because voiding (a soft flag that is audited and reverses the summary) is the
designed reversal and a hard delete leaves no trace. Creating a contribution
already marked `received` requires `contributions.receive`, mirroring the
sponsorship guard — without it the promised-versus-received control is bypassable
by setting the final state at creation time; the one carve-out is a row carrying
`sponsorshipId` written by a holder of `sponsors.receive`, which is how receiving
a sponsorship mirrors into the contributions ledger. And `members.*`, `roles.*`
and `settings.*` are admin-only by design: the checklist in
`ADMIN_ONLY_PERMISSION_GROUPS` no longer offers them, so do not add
`hasPermOf()` clauses for them here without also making `members.assignRole`
unable to grant admin or to grant a permission the actor does not hold.

`adminCount` on the pandal document is read through guarded accessors
(`currentAdminCount()` / `afterAdminCount()`) because nothing ever backfilled the
field; a pandal that predates it reads as 1 instead of erroring, which would
otherwise deny every member update including the migration that would repair it.
`scripts/backfill-ganesh-admin-count.js` writes the true count where it differs —
run it with `--dry-run` first.

The festival wildcard also range-checks payloads: money fields must be numbers
in `[0, 1e9]`, `status` must match the enum for its subcollection, and the
`summary` document accepts only the fifteen `EMPTY_GANESH_SUMMARY` keys plus
`updatedAt`. This stops negative, non-numeric, overflow and stray-field writes.
It does **not** stop a member who may write a ledger side-effect from writing a
plausible wrong number into `summary`; closing that needs server-side summary
maintenance. The backlog entry is GS-004 in `GANESH_SEVA_AUDIT_TICKETS.md`.

`firestore.indexes.json` declares the composite indexes for queries that filter
and sort at the same time. Borrowings and Spending Spaces need
`borrowingRepayments` by `borrowingId` + `date` and `expenses` by `spaceId` +
`date`. Money Lent (receivables) adds `receivableRepayments` by `receivableId` +
`date` and `receivables` by `status` + `lentDate` — deploy indexes manually
after pulling that change; index builds are asynchronous (see below).

Signed-in users may read `system_settings/global`. Release pointer docs
(`latest_release` and `latest_release_{expense|nutrition|ganesh}`) are
readable without auth so the in-app update prompt can attach before sign-in.
Only `global` is writable from the client.
Release APKs live under Storage `releases/**` and are readable by signed-in
users; clients cannot write them.

## Deploying

Requires the Firebase CLI and access to the project.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project <project-id>
firebase deploy --only firestore:indexes --project <project-id>
firebase deploy --only storage --project <project-id>
```

Preview the rules change before it goes live:

```bash
firebase deploy --only firestore:rules --project <project-id> --dry-run
```

Index builds are asynchronous. A newly declared index can take several minutes
to finish backfilling on a large collection, and queries that need it fail with
a `failed-precondition` error until it is ready.

## Rollback

Firestore keeps a rules version history in the console under Firestore →
Rules → History. Roll back there, then revert the corresponding commit here so
the two stay in sync.
