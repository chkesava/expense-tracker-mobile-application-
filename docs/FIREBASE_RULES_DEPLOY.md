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

## What they cover

`firestore.rules` confines everything under `users/{uid}/...` to its owner,
including the three collections this feature adds:
`users/{uid}/borrowings`, `users/{uid}/borrowingRepayments` and
`users/{uid}/spaces`. Duress mode writes to `<uid>_duress`, so the ownership
helper accepts the auth uid and that uid with the duress suffix — the contract
asserted by `lib/duressPath.contract.test.ts`. The shared `vaults`, `splits` and
`paymentRequests` collections keep their member-based access.

`firestore.indexes.json` declares the composite indexes for queries that filter
and sort at the same time. Borrowings and Spending Spaces need
`borrowingRepayments` by `borrowingId` + `date` and `expenses` by `spaceId` +
`date`. Money Lent (receivables) adds `receivableRepayments` by `receivableId` +
`date` and `receivables` by `status` + `lentDate` — deploy indexes manually
after pulling that change; index builds are asynchronous (see below).

Signed-in users may read `system_settings/global` and
`system_settings/latest_release`. Only `global` is writable from the client.
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
