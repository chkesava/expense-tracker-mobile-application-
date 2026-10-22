# SPENDLY-512: Journal history, month loads, reports and export on the read model

[SPENDLY-512](https://kesavach.atlassian.net/browse/SPENDLY-512) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-512-journal-read-model`, cut from the epic branch after SPENDLY-511 was merged.
- Runbook: `docs/READMODEL_RUNBOOK.md`, section "Flipping a screen".

The live (staged) window, the newest 300 rows per collection, **stays on Firestore**, so today's activity stays realtime. Everything older now goes through the SPENDLY-511 read path, under the same `readModel.journal` switch.

## What changed

| Data need | Firestore (default) | Supabase |
|---|---|---|
| Month loads (SPENDLY-511) | The previous `date`-range query | The same month from the read model |
| **Older pages** (`loadMoreExpenses` / `loadMoreIncomes`, and `loadAll*`) | The previous cursor query, **moved unchanged**: `createdAt desc`, `startAfter`, `limit(50)`, logged | Keyset pages by `date desc, doc_id desc` (the order the Journal shows), 50 at a time, active rows only (RLS own rows), then undated rows, then complete |
| **Reports and export** | Built from the rows the provider holds | **The same code, on the same rows.** No separate path was needed: `buildJournalReport` and the CSV/HTML renderers only ever see provider rows, and export waits until history is complete |

**Details:**
- **Separate cursors:** the provider keeps the Firestore cursor and the read-model cursor apart. A session that falls back mid-history continues on the bounded Firestore cursor.
- **Boundary merge:** `unseenRows` is now used by all four loaders, with the same rule as before. A row in the live window or an earlier page is never added twice, and the row on screen keeps its local version.
- **Deleted rows:** ids removed on the device this session are kept out of read-model pages.
- **Same object shape:** read-model rows come back as the object Firestore would have returned (`fromReadModelDoc`): the source `doc`, `id`, and `createdAt`/`updatedAt` restored as `Timestamp`s.
- **Shadow mode:** pages are served by Firestore, because the two sources page in different orders. Once Firestore has loaded a collection's **whole history**, the whole history is read from the read model in the background and compared (ids, amounts, dates), and differences are logged. Month loads keep the per-load comparison from 511.

**Firestore mode is today's behaviour:**
- A test pins the cursor query exactly: path, `orderBy`, `startAfter`, `limit(50)`, the `logDirectRead` arguments, the soft-delete filter and the cursor advance.
- No read-model connection is attempted.
- The state updates (cursor, has-more, complete, merge) happen in the same order as before.

## Tests

| Test | Proves |
|---|---|
| `lib/readModel/journalHistory.test.ts` (9) | The previous cursor query, unchanged, with no connection. Shadow pages from Firestore. Supabase pages the read model by date (no Firestore read, right filters and order, keyset after the cursor) and drops locally removed rows. A read-model failure falls back to the bounded Firestore page. Paging walks full pages, then undated rows, then completes. Cursor values are quoted, so a doc id can't break the filter. Timestamps and `id` are restored. The whole-history shadow comparison reports missing and differing rows, and does nothing outside shadow |
| `lib/readModel/journalExportParity.test.ts` (4) | On the SPENDLY-503 golden fixture, shaped as Firestore returns it vs as the read model returns it, through the real pipeline, report model and renderers: **the CSV and the PDF HTML are identical** for two months, the totals are equal, the **anchored running balance (SPENDLY-487) is identical row by row**, and the displayed order is the same. A mutation check (read-model `createdAt` shifted by one hour) makes the export test fail, so it is sensitive to times |
| `shared/utils/ledgerSnapshot.test.ts` (+3) | The boundary merge never re-adds a live or earlier row, keeps order, and keeps the local version |
| SPENDLY-511 tests | Still pass with the shared resolver |

Results (2026-10-22):
- `npm test` passes, as do `typecheck:shared` and full `tsc`.

## Firestore read savings (estimate, to be measured)

| | Firestore (today) | Supabase |
|---|---|---|
| Live window | 300 rows per collection, realtime | Unchanged |
| Older history (one full scroll, or before an export) | 1 read per document beyond the window. At today's size, the largest ledger is about **1,000 extra reads per session** that loads it all | **0 Firestore reads** |
| Month load | 1 read per row in that month | **0 Firestore reads** |

These are estimates (E) from the production inventory (2026-10-22: `expenses` 1,372 and `incomes` 46 across 24 users). The read counters (`logDirectRead`) only run in `__DEV__`. **The production measurement** is the Firebase console's daily reads for the 7 days before and after the flip, recorded in this doc when it happens.

## Additions (2026-10-22, after review)

| Addition | What |
|---|---|
| **Filtering in SQL** | Details below |
| **Spendly Test can test every mode** | Details below |
| **Builds can reach the read model** | `release.yml` and `web-deploy.yml` now write `EXPO_PUBLIC_READMODEL_SUPABASE_URL` (from the repo variable `READMODEL_SUPABASE_URL`, set on 2026-10-22) and `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY` (a secret) into the app's `.env`. Before this, no app build could ever have reached the read model |
| **Sync key** | The sync, verify and parity steps use `READMODEL_FIREBASE_SERVICE_ACCOUNT`, falling back to the existing `FIREBASE_SERVICE_ACCOUNT`. The user chose to reuse it; a read-only key can be added later without a code change |

**Filtering in SQL:**
- `journalMatchFromFilters` turns the Journal filter's category, account (names mapped to ids) and amount conditions, plus the date scope, into **necessary** conditions.
- In `supabase` mode the provider's `loadMatchingExpenses` / `loadMatchingIncomes` fetch every row satisfying them (with a ±₹0.01 amount margin for SQL rounding) and merge them in.
- So a filtered Journal is complete without paging all history. The screen still applies its full filter (kind, tags, status, search), so what it shows doesn't change.
- **In `firestore` (default) and `shadow` modes these calls do nothing.** It runs 400 ms after the filter changes, and only while history and the month aren't already loaded.

**Spendly Test can test every mode:**
- A **loopback** read model (`lib/readModel/backend.ts`) serves the `supabase`/`shadow` source in local test builds. It reads the emulator through the same round trip as the real sync (`mapDocument` → JSON → `fromReadModelDoc`) and the same row rules as the SQL (live rows, date keyset order, filters).
- It never connects to Supabase. Emulator tokens are unsigned, and test builds must never see production data.
- `scripts/readmodel-set-mode.ts` writes the emulator's settings when `FIRESTORE_EMULATOR_HOST` is set, with test-only `--loopback-fail` (outage) and `--loopback-lag` (stale banner) knobs, which are refused against production. Verified on the emulator: the write is a merge that keeps the other settings.
- All read-model reads (month, pages, matches, shadow, freshness) now go through one `ReadModelBackend` interface: `supabaseBackend` or `loopbackBackend`.

**Added tests:**
- `lib/readModel/backend.test.ts` (8): the loopback's month, paging, filter rules and knobs; matches through the read path (default and shadow do nothing; the test build uses the loopback with no connection; a failure returns null); the Supabase filter query with the paisa margin.
- `shared/utils/journalReadModelMatch.test.ts` (5).
- `scripts/readmodelSetMode.test.ts` (+1).

## Not done / open

- **The flip:** `shadow` → 7 days with zero diffs → `supabase` (with your approval) → 7 days with zero incidents. That's the Definition of Done, and it needs the live sync plus the SPENDLY-510 gate.
- **The read-delta measurement** (above), at the flip.
- **Manual checks:** scroll a long ledger, filter, and export one month in both modes. **Spendly Test can now do this** with the loopback (runbook, "Testing on a phone with Spendly Test"). A normal build against the live read model follows after setup.
- **Filtering in SQL:** built (see "Additions" above).
