# SPENDLY-679: spaces and trips saves reach Supabase; the dual-write guard checks each write

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-679-spaces-trips-dual-write` |
| Migration | none; rules unchanged |

## The gap (dual-write audit, 2026-11-05)

Four writers saved to Firestore only, so they reached Supabase only with the nightly sync:
- `useSpaces`: `createSpace` and `updateSpace`.
- `useTrips`: `createTrip` and `updateTrip`.

A trip edit (and the `spentAmount` change from linking or unlinking an expense) also didn't stamp `updatedAt` (R1.2). So the planned `safety-net` nightly mode wouldn't see it until the weekly full pass.

The 671 guard checks file by file. Both files already called `noteDirectWrites` in their delete paths, so they passed.

## Fixed

- **Spaces:** create and edit call `noteDirectWrites(uid, [ref.path])` after the commit: the client outbox plus the server push, like every other direct writer.
- **Trips:**
  - create and edit call `noteDirectWrites`;
  - create stamps `updatedAt` as well as `createdAt`;
  - edit stamps `updatedAt`;
  - link and unlink stamp `updatedAt` on the trip with the `spentAmount` change. Those already had their hook through `trackedBatch`.

## The guard, per write site

`lib/readModelWriteHooks.test.ts` gains a per-site rule. Every **direct SDK write** (`setDoc`, `updateDoc`, `deleteDoc`, `addDoc`) to a synced collection must have its own read-model hook within 25 lines, which is the same function in this codebase.

Batch and transaction writes keep the existing check. Their hook is `trackedBatch(...).writtenPaths()` or `noteTransactionWrites` after the commit, which can be further away.

**Mutation check:** with the fix reverted, the guard fails, naming exactly the four sites: `useSpaces.ts:68`, `:100` and `useTrips.ts:83`, `:110`.

A source pin also checks that spaces and trips call the hook and stamp `updatedAt`.

## Results

- `npx vitest run`: 540 files, 7,673 tests pass.
- `npx tsc --noEmit -p .` passes.
- `npm run test:rules` passes. The trip and space rules don't restrict extra fields, so `updatedAt` is accepted.

## After the epic reaches main

Nothing extra. After the release, existing spaces and trips reach Supabase on their next save. The nightly sync already copies them.
