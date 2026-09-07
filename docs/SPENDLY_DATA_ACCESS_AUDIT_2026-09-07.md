# Spendly data-access audit — 2026-09-07

Scope: why Spendly users could not read their own accounts, transactions and
statements, and whether anything else in the data-access layer is broken.
Triggered by a live incident, so this phase applied fixes rather than staying
diagnostic.

Everything here was verified against the real rules engine (Firestore emulator),
not by reading. Each finding states the probe that proved it.

---

## P0-1 — Every personal collection query denied (FIXED, deployed)

`firestore.rules` excluded `pandalMemberships` from the recursive owner grant by
indexing the recursive wildcard:

```
match /{document=**} {
  allow read, write: if isOwner(uid) && document[0] != 'pandalMemberships';
}
```

**Why it breaks.** A recursive wildcard is unbound on a `list`: a query targets a
collection, so there is no document path for `document[0]` to index. The
expression does not evaluate to false — it raises an error, and an errored
condition denies:

```
Variable  is not bound in path template. for 'list'  @ L47
```

**Blast radius.** Every query under `users/{uid}/...`: `expenses`, `incomes`,
`accounts`, `accountTypes`, `accountEntries`, `accountPayments`,
`accountTransfers`, `categories`, `subscriptions`, and nested collections such as
`accounts/{id}/statements`.

**Why it was hard to see.** Single-document `get`s and *every write* still
worked, because `document` is bound on those. Sign-in worked. Saving worked.
Only listing broke. The app's own copy ("You don't have access to this. Sign in
again or ask the owner for access.") pointed the diagnosis at auth rather than
rules.

**Fix.** Read the excluded name off a single-segment wildcard, which is bound for
both `get` and `list`:

```
match /{collection}/{document=**} {
  allow read, write: if isOwner(uid) && collection != 'pandalMemberships';
}
```

Same coverage, same exclusion, no unbound variable. The KAN-9 intent is intact:
the recursive grant still must not cover `pandalMemberships`, or a client could
forge `role`/`status` on their own index.

**Introduced by** 32343bc (KAN-9). **Fixed in** 8701f94 (#71), deployed to
`expenseapp-27f94` ahead of the merge because users were locked out.

**Data note.** The broken rules blocked reads but never writes for as long as
they were live. Users who saw an empty state and re-entered data may now have
duplicates surfacing.

---

## P1-1 — Signed-out release-pointer read denied, breaking the pre-sign-in update prompt (FIXED)

`isReleasePointer()` was declared at the **top level**, outside the match that
binds `docId`:

```
function isReleasePointer() {
  return docId == "latest_release" || ...;   // docId not in scope here
}

match /system_settings/{docId} {
  allow read: if isReleasePointer() || signedIn();
}
```

The rules compiler said so on every deploy, and the warning had been carried long
enough to become background noise:

```
[W] 239:14 - Invalid variable name: docId.
[W] 240:12 - Invalid variable name: docId.
[W] 241:12 - Invalid variable name: docId.
[W] 242:12 - Invalid variable name: docId.
```

**Why it breaks.** Same class as P0-1: the undefined variable makes the function
error at call time, and the errored condition denies. For an anonymous caller
`signedIn()` is also false, so the whole grant denies.

**Blast radius.** The grant exists precisely so the update prompt can attach
before sign-in finishes ("Ganesh login especially", per the comment it carries).
That path was dead. Signed-in users could still read the pointer via
`signedIn()`, so in-app updates worked *after* login and the failure stayed
invisible.

**Probe.** Signed-out `get` of `system_settings/latest_release` and
`latest_release_expense` — both denied before the fix, both succeed after.

**Fix.** Move the function inside the match block so `docId` is in scope.

---

## P1-2 — Anonymous enumeration of `paymentRequests` (OPEN — needs a design decision)

```
match /paymentRequests/{requestId} {
  allow read: if true;
  ...
}
```

`read` covers **both `get` and `list`**. So any unauthenticated client on the
internet can dump the entire collection.

**Proved, not theorised.** A signed-out emulator client listing the collection:

```
>>> ANON LISTED 2 paymentRequests:
    {"slug":"abc123","createdBy":"victim-uid","payeeName":"Real Person",
     "upiId":"realperson@okhdfcbank","amount":4500,"note":"rent","status":"active"}
    {"slug":"def456","createdBy":"victim2","payeeName":"Someone Else",
     "upiId":"someone@ybl","amount":12000,"note":"loan","status":"active"}
```

`shared/types/paymentRequest.ts` puts `payeeName`, `upiId`, `amount`, `note`,
`createdBy` and `payeePhotoUrl` on the document. Real name plus UPI ID plus a
recent amount is directly usable for payment fraud and social engineering, and it
is harvestable in bulk without an account.

**Why the obvious fix is wrong.** `allow list: if false` would break the feature.
`hooks/usePublicPaymentRequest.ts` resolves the public page with a *query*:

```
query(collection(db, "paymentRequests"), where("slug", "==", slug), limit(1))
```

That is a `list` operation, so the public link genuinely needs list permission
today. Turning it off blind would repeat exactly the mistake in P0-1 and P1-1.

**The repo already has the right pattern.** `splitClaims` separates the two:

```
allow get: if true;
allow list: if false;
```

It can do that because a claim is addressed by document id. The fix for payment
requests is the same shape: make the **slug the document id**, change
`usePublicPaymentRequest` to `getDoc(doc(db, "paymentRequests", slug))`, then
narrow the rule to `get`. Slugs are already random (`generateSlug()`), so an id
lookup is no more guessable than the current link.

**Migration cost — the reason this is not fixed here.** Existing documents have
auto-ids, so every payment link already in circulation resolves through the
query. A cutover needs a backfill (copy to slug-id documents) and a transition
window where the hook falls back to the query. That is a deliberate change with a
data migration, not something to land unannounced during an incident fix.

---

## P1-3 — Anonymous enumeration of `splitPublicShares` (OPEN — same root cause)

Identical rule shape (`allow read: if true`) and identical read pattern
(`hooks/usePublicSplitShare.ts` queries by slug), so the same enumeration works.

Lower severity than P1-2 on the repo's own reasoning — the comment on the
collection states this snapshot deliberately carries "no account ids, user ids,
or UPI". It is still a bulk-readable record of who split what for how much.

Same fix and same migration cost as P1-2; they should be done together.

---

## Checked and clean

Verified with the exact queries the app runs, against the real rules engine:

- `useVaults` or-query (`ownerId == uid` OR `memberIds array-contains uid`) — owner and member both list successfully.
- `vaults/{id}/expenses` list as a member.
- `useSplits` both queries (`createdBy == uid`, `participantIds array-contains uid`).
- `system_settings/global`: signed-in read and write allowed, signed-out read denied.
- `system_settings/latest_release*`: not writable from the app, signed-in or out.
- Personal tree write paths — never affected by P0-1.
- `npm run typecheck` — clean.
- `npm test` — 166 files, 1753 tests, all passing.

The `docId` scope error in P1-1 was the **only** instance of its class: the rules
compiler emits a warning for every occurrence, and the deploy output contained
exactly those four lines.

---

## Test coverage added

Rules coverage went from Ganesh-only to covering the Spendly surface. All six
pre-existing suites were Ganesh; the personal tree and `system_settings` had
none, which is why both bugs shipped silently.

| File | Cases | Covers |
| --- | --- | --- |
| `firestore/personalData.rules.test.ts` | 25 | list + write per personal collection, ordered query, nested sub-subcollection, duress tree, stranger denial, membership-index forgery |
| `firestore/systemSettings.rules.test.ts` | 9 | signed-out read of all four release pointers, `global` read/write, write denial on pointers |

Full rules suite: **144 passing**.

12 of the personal-tree cases fail against the pre-fix rules, and 4 of the
system_settings cases fail against the pre-fix rules. Both were confirmed
red-then-green rather than written after the fact.

---

## Remaining concerns

1. **P1-2 and P1-3 are open** and need the slug-as-document-id migration above.
2. **Rules deploys are manual** (`docs/FIREBASE_RULES_DEPLOY.md`) and CI never
   runs them. Both bugs in this report were live in production while `main` and
   the console agreed — the gap was that nothing *tested* the deployed behaviour.
   `rules-tests.yml` now exercises the Spendly surface on every PR, which closes
   the detection gap but not the deploy gap.
3. **Compiler warnings are not fatal.** P1-1 announced itself on every single
   deploy for as long as it existed. Failing a deploy on rules warnings would
   have caught it the first time.
