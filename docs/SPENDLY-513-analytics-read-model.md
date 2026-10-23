# SPENDLY-513: Insights, cash-flow history, audit history and cashback on the read model

[SPENDLY-513](https://kesavach.atlassian.net/browse/SPENDLY-513) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-513-insights-read-model`, cut from the epic branch after SPENDLY-512 was merged.
- Runbook: `docs/READMODEL_RUNBOOK.md`, section "Flipping a screen".

Four history reads move behind the SPENDLY-511 read path. Each has its own switch, `system_settings/global.readModel.<screen>`, and its own fallback. **The default is `firestore`, which does exactly what the app does today and never connects to the read model.**

## What changed

| Screen key | Data need | `firestore` (default) | `shadow` | `supabase` |
|---|---|---|---|---|
| `insights` | The Insights month | The rows the device holds, unchanged | The same, plus a background comparison with the bounded Firestore month query | The month's **complete** rows from the read model by month key, with this device's newer writes overlaid |
| `cashFlow` | Dashboard 6-month chart | The 6-month summary-doc listener, unchanged | The same, plus a per-month comparison with `v_cash_flow_by_month` | The listener covers only the current and previous month (the tiles stay on Firestore until Phase 4). The 4 older months come from `v_cash_flow_by_month`, or on failure from one bounded read of the same summary docs |
| `audit` | One transaction's history (`transactions/[id]`, Journal sheet) | The `where docId ==` listener, unchanged | The same, plus a comparison of event ids (events newer than the 3 h SLO are ignored) | **No listener.** The row's events page newest first from `ledger_events` |
| `audit` | The whole audit trail (Audit tab) | The newest 100 events (realtime) plus Firestore cursor pages, unchanged | Unchanged | The newest 100 stay realtime. Older pages come from the read model by keyset (`created_at desc, doc_id desc`), starting just below the window. Overlap is dropped by id |
| `cashback` | Linked purchase notes on the card screen | The rows the device holds, unchanged | Logs how many linked purchases the device lacks | Linked purchases older than the loaded Journal window are fetched by id, so their notes show |

**No number gets a second owner.** Every total is still computed by the existing TypeScript helpers, over the rows each source returns: `groupByCategory`, `getTopVendors`, `getPacingMetrics`, `buildCashbackHistory` and the rest. The SQL view (`v_cash_flow_by_month`) is golden-tested against `calculateDashboardSummaries`.

**Details:**
- **Insights uses the month key, not a date range.** The Journal's month load is a `date` range. Insights assigns a row to the month in its `month` field (else its date: `isInMonth`). The read model's `month` column is filled by the same rule, so Insights queries by it. Building this caught a real trap: a row dated 30 Sep but booked to October (fixture `e5`) would otherwise land in the wrong month.
- **The Insights overlay** (`insightsMonthRows`):
  - a row removed on this device is dropped;
  - a row the device has moved to another month is dropped from this month;
  - the device's own rows in the month are overlaid, and the newer version wins.
- **Cashback rows never change source.** The provider already listens to every `accountPayments` row, so totals were complete. Only the notes of old linked purchases were missing. Totals are identical in every mode (tested).
- **A missing amount is never shown as 0.** If `v_cash_flow_by_month` returns a null total (a row with no amount), the read fails and falls back to Firestore.
- **Fallback banner.** A screen that fell back shows "History copy unavailable — showing live data" (a new `fallback` freshness state). This applies to the Journal too.
- **Freshness badges:** Insights, the dashboard chart, the transaction history and the Audit tab, and the cashback card. In `firestore` mode they render nothing. The transaction history passes the row's own `updatedAt`, so an edit newer than the last sync reads "Updating…".
- **Shared resolver:** `lib/readModel/screenReadPath.ts` now holds the session read path and `resolveReadModelBackend(screen, …)` for every screen. `journalReadPath.ts` keeps its API and delegates to it.
- **Read conditions reach other screens:** the provider exposes `readModelSession` (current read conditions plus the ids removed on this device) through `useExpenses()`.
- **Loopback:** both backends gained `byMonthKey`, `cashFlow`, `auditPage` and `byIds`, so Spendly Test can exercise every mode of every screen. The runbook's emulator commands work with `--screen=insights|cashFlow|audit|cashback`.

## SQL

- **Migration `20261027000000_readmodel_phase3_reads.sql`:** grants `authenticated` SELECT on `v_cash_flow_by_month` and the two `v_active_*` views it reads through. They are `security_invoker`, so RLS (owner only, live rows) still applies. Nothing else is granted.
- **`assert_security.sql`:** the allowed-grant list now includes exactly those three views, and they must be `security_invoker`.
- **`views.sql`:** checks the exact list (anon never has access).
- **`rls_behaviour.sql`:** user A's cash flow totals only A's live rows (a tombstone and user B's row are excluded). `v_period_totals` stays closed, and anon can't read the view.

## Tests

| Test | Proves |
|---|---|
| `lib/readModel/analyticsReadPath.test.ts` (17) | **Default `firestore`:** every source returns null, never connects, reads nothing. Each screen has its own switch. **Insights:** complete month minus locally removed rows; a failure falls back and is logged; shadow uses the bounded month query. **Cash flow:** months from the read model; a failure serves the summary-doc read; a null total throws; the view query and range; shadow compares to the paisa. **Audit:** keyset paging per transaction; null in shadow and on failure; the cursor below the live window; shadow ignores unsynced events. **Cashback:** fetch minus removed rows; nothing to fetch, no connection |
| `lib/readModel/analyticsParity.test.ts` (8) | On the SPENDLY-503 golden fixture, Firestore-shaped vs read-model-shaped through the real sync mapping: **every Insights figure is identical for 3 months** (totals, categories, subcategories, accounts, daily series, weekend split, day of week, vendors, anomalies, smart insight, pacing). The cross-month edit lands by `month`. A one-paisa mutation is detected. The overlay counts a fresh row once, keeps an edit's newer amount and drops a removed row. **Cash flow equals `calculateDashboardSummaries`** for every month, to the paisa, with counts. **Cashback:** each cashback once, totals unchanged, note filled |
| `lib/readModel/auditNoListener.test.ts` (2) | `transactions/[id]` reads audit only via `useLedgerEvents({ docId })`. The hook's read-model branch returns before its only `onSnapshot` (structural: tests run in node, with no renderer) |
| `shared/utils/ledgerEventPages.test.ts` (+3) | The audit strategy: one transaction in `supabase` mode uses read-model pages with no listener; the whole trail keeps its realtime window; `firestore`/`shadow` keep today's listener |
| `shared/utils/readModelReadPath.test.ts` (+2) | Per-screen keys default to `firestore`; the fallback banner |
| SQL suite (local Postgres 18) | `assert_security`, `rls_behaviour`, `sync_functions`, `purge`, `verify`, `views` and `golden` all pass with the new migration |

Results (2026-10-22):
- `npm test`: 420 files, 6012 tests pass.
- `npx tsc --noEmit` and `typecheck:shared`: clean.
- SQL suite: as in the table above.
- There is no lint config in the repo.

## Firestore read savings (estimate, to be measured at the flip)

| Read | Firestore (today) | Supabase |
|---|---|---|
| Dashboard chart | 6 summary docs per listener attach, plus 1 per change | **2** (current and previous month) |
| One transaction's history | 1 read per event of that row, plus realtime updates | **0** |
| Audit tab, older pages | 1 read per event per page | **0** |
| Insights, an older month | 0 (shows only loaded rows, so often incomplete) | 0, and the month is complete |
| Cashback notes | 0 (old notes missing) | 0 |

The production measurement is the Firebase console's daily reads for the 7 days before and after each flip, recorded here.

## Not done / open

- **Flips:** per screen, `shadow` → 7 days with zero diffs → `supabase` (with your approval), after the SPENDLY-510 gate. Apply migration `20261027000000` before flipping `cashFlow`.
- **Read-delta measurement** at each flip (above).
- **Manual checks:** compare Insights for 3 months in both modes. Spendly Test can do this with the loopback: `--screen=insights`.
- **Audit lag (decision for the flip):** in `supabase` mode a transaction's history lags up to the 3 h sync, marked "Updating…". If that's not acceptable for edits made on this device, keep `audit` on Firestore.
- **Not used:** the ticket names `v_period_totals`/`v_account_flows` for Insights. Insights runs the same helpers over the month's rows instead, which is exact by construction. Those views stay parity-only and ungranted.
