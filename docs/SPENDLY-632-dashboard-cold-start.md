# SPENDLY-632 — Dashboard cold-start delay and incomplete rendering

Branch: `fix/SPENDLY-632-dashboard-cold-start` (standalone bug, from `main` 6f353f30).
Follow-up epic: **SPENDLY-633** (durable native Firestore cache).

## Root causes (from the code)

1. **Native has no durable Firestore cache.** `lib/firebase.ts` asks for
   `persistentLocalCache`, but the Firebase JS SDK only persists to IndexedDB,
   which React Native lacks, so Android/iOS silently run on memory cache. Every
   cold start therefore waits on a server round trip for every dashboard
   listener before any figure can draw. Warm starts don't (the memory cache is
   still alive). This is the main cold-start cost; the real fix is SPENDLY-633.
2. **The net-worth card waited on data it does not use.** In progressive mode
   `useUnifiedNetWorth` held `loading` until accounts, account types,
   expenses, incomes, account entries, payments *and* transfers had all loaded.
   `composeNetWorth` reads only stored account balances (plus the deferred
   secondary sources); the ledger listeners feed only the
   `liquidBalanceMayBePartial` flag. Entries/payments/transfers attach only
   after `scheduleIdleWork` (InteractionManager) and are unbounded
   full-collection reads, so the top card sat on a skeleton for the longest
   chain on the screen.
3. Skeletons are not literally infinite: each section's flag resolves when its
   listener answers (the Firestore SDK raises a `fromCache` snapshot when
   offline). On a cold start with no cache they simply last as long as the
   server round trip (cause 1), which matches the screenshots.

Not changed, after inspection:
- **Bottom clearance:** `PageShell` already pads by `useSpendlyBottomClearance({ withFab: true })`
  (nav + FAB + safe-area inset, covered by `lib/spendlyBottomClearance.test.ts`).
  The "overlapping" screenshot is consistent with a card mid-load scrolled under
  the floating nav; no layout cause was found in code. Re-check on device.
- **Entrance animation:** `DashboardEntrance` delays are capped at 225 ms +
  260 ms fade, on the UI thread — not a material share of the wait.

## Fix

| Change | Files |
|---|---|
| Progressive net worth waits on accounts + account types only (`netWorthLoading`). Totals are identical; the partial-ledger note still shows while the ledger is incomplete. Non-progressive callers unchanged. | `shared/utils/netWorth.ts`, `hooks/useUnifiedNetWorth.ts` |
| **Last-seen dashboard snapshot** — display-only copy of the six dashboard period summaries and the net-worth totals, per user + month, in AsyncStorage. Shown per section only while that section's live data is loading, under a "Showing figures saved … · updating…" label. Saved only from a settled, complete picture (summaries loaded without error, net worth incl. valuations loaded). | `shared/utils/dashboardSnapshot.ts`, `lib/dashboardSnapshotStore.ts`, `hooks/useDashboardSnapshot.ts`, `app/(app)/dashboard.tsx` |
| Cleared on sign-out; never read or written in duress; ignored if malformed, another user/month, or > 7 days old. | `providers/AuthProvider.tsx`, `shared/utils/dashboardSnapshot.ts` |
| Cold-start perf marks: `dashboard_snapshot_shown`, `dashboard_networth_ready`, `dashboard_networth_complete`, `dashboard_summaries_ready`, `dashboard_recent_ready` (plus existing `dashboard_mounted`, `dashboard_data_ready`, `dashboard_hydrated`). | `app/(app)/dashboard.tsx` |

### Invariants kept
- No balance, summary or transaction value is computed differently. The snapshot
  holds what the live hooks already produced; nothing reads money from it.
- Saved figures are always labelled and never recorded as today's net-worth
  history point (`secondaryLoading: true` → `valuationsLoading` blocker; tested).
- No new Firestore listeners or reads. Recent Activity is not cached (it holds
  transaction rows); it still waits for the staged expenses page.
- Privacy/ghost mode unchanged: cached figures go through the same components.

## Tests
- `shared/utils/dashboardSnapshot.test.ts` (new, 10): build only when settled,
  never in duress; round trip; misses for other user/month/duress/age/malformed;
  newest-first restore; cached net worth blocked from history; age label.
- `shared/utils/netWorth.test.ts` (+3): `netWorthLoading`, and totals unchanged
  by ledger inputs.

## Measurements (to fill on device)
Spendly Test on the emulator (`docs/LOCAL_TEST_MODE.md`), same device, release
build with `EXPO_PUBLIC_PERF_MARKS=1`; read `[perf]` lines via `adb logcat`.

| Scenario | Mark | Before | After |
|---|---|---|---|
| Cold start | `dashboard_networth_ready` | | |
| Cold start | `dashboard_summaries_ready` | | |
| Cold start | `dashboard_snapshot_shown` | n/a | |
| Warm start | `dashboard_networth_ready` | | |
| Slow network (throttled) | `dashboard_networth_ready` | | |
| Offline cold start | first figures visible | | |

Firestore reads: unchanged by design (no listener added/removed); confirm with
`lib/firestoreReadDebug` counts.

## Open
- Device before/after numbers and the overlap screenshot re-check (above).
- The full fix for cold start is SPENDLY-633.
