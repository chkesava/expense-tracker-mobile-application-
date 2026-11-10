# SPENDLY-742 — Category taxonomy upgrades run on the server, not at sign-in

Story in epic **SPENDLY-735**, audit item A2. Branch `feature/SPENDLY-735-remaining`.

## Before
On every sign-in, `AuthProvider` ran `ensureCategoryHierarchy`.
- **Stamp current:** one document read (SPENDLY-501).
- **Stamp behind** (a new shipped taxonomy):
  - it read all categories twice;
  - it read **every expense**, budget, rule, subscription and trip, and remapped them on the phone;
  - it upserted the defaults and bumped the categories revision (SPENDLY-660).

That was a full-ledger burst at sign-in.

## After
- **One migration, two SDKs.** The migration moved unchanged into `shared/data/categoryHierarchyMigration.ts`. The Firestore functions come in as an `env`, and so does the announce (`env.noteDirectWrites`, in `finally`: SPENDLY-712/730).
  - The app binds `@/lib/firestore` and its read-model hooks (`lib/ensureCategoryHierarchy.ts`).
  - The server binds an Admin SDK adapter (`adminCategoryEnv`).
- **The app only seeds.** `ensureCategoryHierarchy(db, uid)` defaults to `upgradeExisting: false`:
  - a new user (no stamp) is seeded exactly as before;
  - an existing user whose stamp is behind returns `deferred` after one read, with nothing written and no ledger read.
- **The server upgrades** (`scripts/category-daily.ts`, `scripts/lib/categoryDailyCore.ts`):
  - It reads every user's `meta/categories` stamp in one collection-group read.
  - It runs the shared migration with `upgradeExisting: true` for each user behind, duress never.
  - It pushes every written path to the read model, including what a failed run committed.
  - A dry run only counts. The log carries counts and error codes only.
- **Schedule:** the Worker's 03:00 UTC run (`category-daily.yml` is first in `DAILY_WORKFLOWS`), gated by `CATEGORY_DAILY_ENABLED`.

## Guards
- **`lib/categoryRevision.test.ts`** (every category writer bumps the revision) and **`lib/readModelWriteHooks.test.ts`** (every synced writer announces) now find the writer at `shared/data/categoryHierarchyMigration.ts`. It reads `doc(db, "users", uid, "categories", …)` as before, so the guards detect it **without an allowlist entry**.
- **`lib/ensureCategoryHierarchy.test.ts`:** the upgrade cases run with `{ upgradeExisting: true }` (the server's path). New cases cover the app's default: deferred with one read, and a new user seeded.

## Tests
- `scripts/categoryDailyCore.test.ts` (4):
  - stale selection;
  - a dry run;
  - upgrade + push + a failure without a uid;
  - the Admin SDK adapter (auto ids, paths, exists/data, read charging, written paths).
- `lib/ensureCategoryHierarchy.test.ts`: 13.

## Owner steps (after the epic reaches `main`)
1. Run *Category daily* as a dry run: `usersBehind` should be 0 today.
2. Set `CATEGORY_DAILY_ENABLED=true` and redeploy the Worker.
3. The next taxonomy release is then upgraded by the server overnight.
