# SPENDLY-611: Goal analytics, charts, filters and CSV/PDF exports

Part of SPENDLY-606. Tracker: `docs/SPENDLY-606-save-goals.md`. Read-model contract: `docs/SPENDLY-609-contributions-history.md`. Rules followed: `docs/READ_MODEL_RULES.md` §3.

## What changed

### Analytics screen: `app/(app)/goals/analytics.tsx` (FRD FR-09)
- **Ranges:** this month, quarter or year, all time, or a custom range (inclusive dates). There is an optional comparison with the previous period of the same kind.
- **Status filter:** any combination of the 5 statuses, so archived and cancelled history is included.
- **Summary:**
  - saved, taken out and net growth;
  - contribution count and average;
  - reductions;
  - completions and milestones reached or lost in the period;
  - completion rate (completed ÷ goals in scope).
- **Savings over time:** a monthly bar chart (saved vs taken out) using the existing `components/charts/BarChart`. Its **text alternative** comes from `analyticsSummaryText`; the chart itself is hidden from screen readers.
- **By goal:** net movement per goal.
- **Reconciliation:** for all time over a complete (untruncated) history, it says whether every goal's saved amount equals its opening amount plus its history (`reconcileGoals`), and names any goal that doesn't match.
- **Registration:** in `_layout.tsx`; `/goals/` was already a back-navigation and restorable prefix (tests added). It is linked from the Goals header.

### Pure logic (with tests)
- **`shared/utils/goalAnalytics.ts`:** local-time ranges with the previous period, scope by status, aggregation, period comparison, reconciliation and the text summary.
  - Money is classified by the sign of `amountDelta`, so net growth is exactly how the saved amounts moved.
  - All totals are computed here over the returned rows (R3.6). There is no SQL aggregate for display.
- **`shared/utils/goalExport.ts`** (FRD FR-10):
  - CSV via `csvField`/`csvNumber`, which neutralises formula injection, and escaped HTML for the PDF.
  - Both respect the date range and the status filter.
  - **Notes are included only when the user turns them on.** For money entries the on-screen detail is "reason · note", so the export never reuses it.
  - Money and dates use the user's currency and date format. A truncated history is stated in the file.

### Delivery
`services/goals/goalExportDelivery.ts` uses the app's `deliverCsv` / `deliverPdf` (share sheet on native, download or print on web). A failure shows a clear toast and leaves goal data untouched.

### Read path (READ_MODEL_RULES §3)
- **New screen key `goals`** in `READ_MODEL_SCREENS`. The default is `firestore`.
- **`lib/readModel/goalSources.ts`:**
  - Supabase `goal_events` query: a created-at range, optionally one goal, keyset `created_at desc, doc_id desc`. It matches the perf queries and indexes added in 609.
  - **Bounded Firestore fallback** (R3.3): a `createdAtMs` range in pages of 500, capped at 5,000 events, flagged as `truncated`.
- **`lib/readModel/backend.ts`:** `goalEventsPage` in **both** backends (R3.5). The loopback applies the SQL's rules to the mapped rows, so Spendly Test can exercise every mode.
- **`lib/readModel/goalsReadPath.ts`:**
  - `readGoalEventsInRange`: `firestore` mode does exactly the Firestore read with no connection. `shadow` serves Firestore and compares ids, skipping events younger than the SLO and truncated reads. `supabase` reads the read model and falls back to Firestore for the session on failure.
  - **Overlay (R3.4):** Firestore events newer than the read model's `lastSyncedAt` minus the SLO are overlaid by id and reported as pending.
  - `readGoalHistoryPage`: older pages of one goal's history in `supabase` mode.
- **Hooks:**
  - `hooks/useGoalAnalyticsEvents.ts` reads once per range change, with no listener. It is mounted only by the Analytics screen.
  - `hooks/useGoalHistory.ts`: in `supabase` mode, older pages come from the read model below the realtime window, with fallback to the Firestore cursor. The newest window always stays a Firestore listener (R4.3).
- **Freshness badge** (`useReadModelFreshness("goals", ["goalEvents"], …)`) on the Analytics screen.
- **`docs/READ_MODEL_RULES.md`:** the screen list now includes `goals`.

## Acceptance criteria → evidence
| AC | Evidence |
|---|---|
| Totals reconcile with the audit history and the summary | `goalAnalytics.test.ts` (`reconcileGoals`). The all-time reconciliation line on screen. Totals come from the same rows by one module (R3.6) |
| Export content matches the selected filters and currency/date formatting | `goalExport.test.ts` (range and scope filtering, injected formatters, notes on/off, escaping, truncation note) |
| Large histories are cursor-paginated; charts don't trigger repeated full-history reads | Read once per range change (no listener). Firestore pages of 500 with a 5,000 cap. Read-model keyset pages. Perf budget from 609 (one-quarter chunk p95 0.83 ms). `saveGoals.qa.test.ts`: dashboard, list and Money section never import history hooks |
| Export failures give clear feedback and lose no goal data | Delivery errors are caught and logged, with a toast. Exports only read |
| Read path (R3): default unchanged, no connection, bounded fallback, shadow, overlay, both backends | `lib/readModel/goalsReadPath.test.ts` (7 tests: firestore mode never connects or reads; supabase via loopback with overlay; keyset paging; failure falls back for the session; duress and offline stay on Firestore; shadow logs id differences, ignoring young events) |

## Tests run
See the Jira comment for this commit.

## Not done / notes
- **The `goals` screen stays `firestore`** until the runbook's 14-day parity gate, then 7 days in shadow, then a flip with approval (R3.9). Nothing in this story changes `system_settings`.
- **Perf:** the queries added in 609 cover these shapes (history keyset and quarter chunk). They are not re-run in this story because no SQL changed.
- **Custom range:** dates are local days, inclusive of both ends.
