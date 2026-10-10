# Spendly Android lag diagnosis (2026-10-10)

The user reported that the latest build "feels very laggy". This was diagnosed on their phone (OnePlus CPH2661, Android 16) running the release build v4.0.7 (build 115), which had been sideloaded at 14:37 that day. Each run captured about 75 seconds of normal use with `dumpsys gfxinfo`, `meminfo`, per-thread CPU from `/proc` and `logcat`.

## Measurements

| Metric | Run 1 (as installed) | Run 2 (after `compile -m speed-profile`) |
|---|---|---|
| Frames rendered | 1,059 | 1,748 |
| Janky frames | 4.44% | 3.09% |
| p95 / p99 frame time | 31 ms / 121 ms | 19 ms / 57 ms |
| Slow UI thread events | 44 | 38 |
| JS thread (`mqt_v_js`) CPU | 21.6 s | 18.4 s |
| UI main thread CPU | 21.0 s | 13.0 s |
| Reanimated failure log lines | 20,057 | 3,304 |

**Device state:** 270 MB of RAM free and 4.99 of 5.6 GB swap used. The whole phone is under memory pressure. The app's PSS was 295–345 MB.

## Findings (P0 = worst)

### P1: a fresh install isn't AOT-compiled
- **Problem:** after `adb install` the app is only compiled in `verify` mode. Its Java/Kotlin code (React Native, Reanimated, Fabric mounting) runs interpreted or JIT until Android's idle-time dexopt runs, which is usually overnight while charging.
- **Evidence:** compiling with `speed-profile` cut UI-thread CPU by 38% and halved p95/p99 frame times. This partly explains why "the latest build" always feels slow at first.
- **Fix:**
  - Run `adb shell cmd package compile -m speed-profile -f <pkg>` after sideload installs.
  - Ship a baseline profile.
  - Enable R8.

### P1: chart animations write to views that are already gone
- **Code:** `components/charts/BarChart.tsx` uses `AnimatedRect` with a `withDelay(withSpring)` per bar. `DonutChart` and `SpendingCurveChart` use the same pattern.
- **What happens:** Reanimated keeps pushing synchronous props to SVG nodes whose surface is gone (`RetryableMountingLayerException: Unable to find SurfaceMountingManager`). Each failure logs an InvocationTargetException with about 140 stack lines on the UI thread.
- **Evidence:** there were 142 failures within one second in run 1, and 32 in run 2, including at launch. These are frame-dropping bursts.
- **Fix:** cancel the shared-value animation on unmount (`cancelAnimation`), don't animate while the screen is unfocused, and/or skip the entry animation for off-screen charts.

### P1: Journal auto-pages through the whole history
- **Code:** `app/(app)/ledger.tsx:816` wires `onEndReached → loadMoreLedger("all")` on a list already filtered to one month. A short list keeps firing `onEndReached`.
- **Effect:** it pages 50-row batches until the full ledger is loaded. Each page re-renders every Expenses/Incomes context consumer about 3 times, because the `isFetchingMore` flags are in the context value. It also re-runs the journal filter pipeline over the growing list.
- **Cost:** roughly O(n²) in history size, on the JS thread.

### P1: every save waits on server reads before the sheet closes
- **Code:**
  - `services/ledger/createLedgerTransaction.ts:111` awaits `getDoc(account)`.
  - `services/ledger/fetchAccountTypes.ts:19` reads accounts **sequentially** for every edit, delete and restore.
  - Similar reads exist in FinanceDataProvider (cashback, entries, transfers), billPayment and useSplits.
- **Effect:** on a weak network each save waits for a server round trip, or for the offline timeout. The accounts are already in memory through the accounts listener.

### P2: AccountsList subscribes to seven unused data sources
- **Code:** `components/accounts/AccountsList.tsx:131-138`.
- **Effect:** it keeps the borrowings, receivables and bills listeners alive, and re-renders on any ledger change, though balances now come from materialized fields. This goes against SPENDLY-406.

### P2: net-worth and runway hooks still depend on full expense/income arrays
- **Code:** `hooks/useUnifiedNetWorth.ts:91-103`, `hooks/useRunwaySources.ts:30-37`.
- **Effect:** they only need the `*Complete` flags now, but they still rebuild on every ledger snapshot.

### P3: Dashboard mounts four summary/recent listeners unconditionally
- **Code:** `app/(app)/dashboard.tsx:106-109`.
- **Memo break:** `categoryTotals={… || {}}` creates a new object on every render, which defeats `memo(BudgetAlertsWidget)`.

### P3: the release build has R8 off and ships two ABIs
- **Detail:** about 51 MB of dex in a 90 MB APK, plus armeabi-v7a native libs.
- **Effect:** this is mainly a size cost; with R8 off there is also no dex shrinking or optimisation at all.

## Correctness bug found along the way (not perf)
`shared/utils/dashboardMutations.ts:33` writes `"categoryTotals.<cat>"` keys inside a `set(..., {merge:true})`. A dotted key isn't a field path in `set()`, so this probably creates literal top-level fields, leaving `categoryTotals` empty. This was not verified against live data.

## Ruled out
- Client-side rebuilds or reconciliation at startup.
- Write→snapshot→write loops.
- New `console.log` calls in hot paths.
- The dashboard gradient hero: a small cost only.

## Related
SPENDLY-486 removes the SMS feature: its native module, receiver and permissions, about 9.7k lines.
