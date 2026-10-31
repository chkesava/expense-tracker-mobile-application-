# SPENDLY-641 — Retire the SPENDLY-632 dashboard snapshot

Epic: SPENDLY-633. Branch: `feature/SPENDLY-641-retire-dashboard-snapshot`.

## Decision: remove it
SPENDLY-632 added a display-only "last seen dashboard" snapshot in
AsyncStorage because native builds had no durable Firestore cache. That is no
longer true:
- **Native**: SPENDLY-638 check 3 — a cold start with Firebase unreachable
  drew the whole dashboard from the native on-device cache, and the snapshot
  label never appeared (the live listeners answered from cache first).
- **Web**: has had an IndexedDB cache throughout.

Keeping it would mean a second copy of money figures that can only ever lag
the real cache.

## What changed
- Removed `shared/utils/dashboardSnapshot.ts` (+ test),
  `lib/dashboardSnapshotStore.ts`, `hooks/useDashboardSnapshot.ts`, the
  dashboard wiring and its "Showing figures saved … · updating…" label.
- Kept from SPENDLY-632: the earlier net-worth loading (`netWorthLoading`),
  the `DashboardEntrance` fix, and the cold-start perf marks
  (`dashboard_snapshot_shown` removed with the feature).
- Sign-out no longer clears a snapshot; instead
  `lib/legacyDashboardSnapshotPurge.ts` removes every leftover
  `spendly.dashboardSnapshot.*` item once per app session (called from
  `AuthProvider`). Tests: `lib/legacyDashboardSnapshotPurge.test.ts`.

## Checks
- `lib/legacyDashboardSnapshotPurge.test.ts`: 2 passed.
- `npm run typecheck`, `npm run typecheck:shared`: clean.
- Full `npm test`: 487 files passed; four wall-clock "stays fast" tests
  (`calendar.qa`, `decisionJournal.qa`, `feePatterns`, `whatIf.qa`) tripped
  under machine load and passed on rerun (62/62); none is touched here.
