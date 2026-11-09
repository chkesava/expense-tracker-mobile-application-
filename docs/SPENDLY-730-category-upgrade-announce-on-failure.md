# SPENDLY-730 — A failed category upgrade still announces what it committed

Bug, standalone (no epic), follow-up to SPENDLY-712, found by CodeRabbit on PR #283. Branch `fix/SPENDLY-730-category-upgrade-announce-on-failure` from `main` (24fb68d8).

## The problem
SPENDLY-712 made `ensureCategoryHierarchy` announce exactly the documents it wrote (`noteDirectWrites`: the client outbox and the server push). The call was at the end of `stampVersion`, so it ran only when every step succeeded.

If a later batch or helper threw, the batches already committed were never announced. A retry didn't announce them either: `planDefaultTaxonomyUpsert` finds them already correct and doesn't write them again. They waited for the nightly sync.

## The fix
`lib/ensureCategoryHierarchy.ts`:
- `ensureCategoryHierarchyOnce` runs the migration (now `migrateCategoryHierarchy`) in a `try` and announces the written set in a `finally`. The set holds only paths from batches that committed, so a failed batch is never announced.
- The error still reaches the caller.
- `stampVersion` no longer announces.
- A run that writes nothing (the early exit, or a stamp only) has an empty set, so nothing is announced, as before.

## Not covered
An app killed mid-run never reaches the `finally`. Those writes still wait for the nightly sync.

## Tests
`lib/ensureCategoryHierarchy.test.ts`, "a failed upgrade still announces what it committed":
- the second batch fails: the first batch's paths are in the outbox and the push, the error is thrown, and the version is not stamped;
- the stamp fails after every batch committed: all of them are announced;
- the first batch fails: nothing is announced.

## Deploy
App only; it ships with the next Expense release. No rules, index, migration or server change.
