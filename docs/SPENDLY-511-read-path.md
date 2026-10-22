# SPENDLY-511: the read path (mode switch, fallback, overlay, freshness)

[SPENDLY-511](https://kesavach.atlassian.net/browse/SPENDLY-511) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-511-read-path`, cut from the epic branch after SPENDLY-510 was merged.
- Runbook: `docs/READMODEL_RUNBOOK.md`, section "Flipping a screen".

## The template data need: Journal month loads

`FinanceDataProvider.loadExpensesForMonth` and `loadIncomesForMonth` now go through the read path:
- They load one month of Journal history when you open an older month.
- Each is one bounded query per month.
- The realtime window, cursor pages and everything else in the provider are unchanged.

| Piece | File | What it does |
|---|---|---|
| Month sources | `lib/readModel/journalMonthSource.ts` | **firestore:** the provider's previous query, **moved unchanged** (same path, `date` range, `logDirectRead`, soft-delete filter). **supabase:** the same month from the read model, with RLS own rows only and the source `doc` as the app object |
| Mode | `shared/utils/readModelMode.ts` | `system_settings/global.readModel.<screen>`: `firestore` (default, kill switch), `shadow` or `supabase`. Anything unknown means `firestore`. **Duress, offline, no read model in the build, or an earlier fallback this session all mean `firestore`** |
| Read path | `lib/readModel/readPath.ts` | Details below |
| Journal wiring | `lib/readModel/journalReadPath.ts`, `providers/FinanceDataProvider.tsx` | Details below |
| Overlay | `shared/utils/readModelOverlay.ts` | Details below |
| Freshness | `shared/utils/readModelFreshness.ts`, `hooks/useReadModelFreshness.ts`, `components/common/ReadModelFreshnessBadge.tsx` | Details below |
| Setting | `providers/SystemSettingsProvider.tsx` (`readModel` field), `scripts/readmodel-set-mode.ts` | Dry run by default; writes only `readModel.<screen>` |

**Read path, by mode:**
- **`firestore`:** only the Firestore source runs.
- **`supabase`:** the read model is used, with a 4 s timeout. On an error or timeout, Firestore serves the rest of the session, and the failure is logged once (no toast loop).
- **`shadow`:** Firestore serves. Supabase is fetched in the background and compared (ids, amounts, dates), and differences are logged at most once per 10 min.
- **Fallback is always bounded:** it only ever uses the screen's own query.

**Journal wiring:**
- With the mode unset or `firestore`, **no read-model connection is even attempted**.
- **Deleted rows stay deleted:** ids removed on this device this session are kept out of read-model results, so a deleted row can't reappear before the sync catches up.

**Overlay (`overlayLocalRows`):**
- Merges by id; the newer version wins (`updatedAt`, else `createdAt`), and a tie or unknown version goes to the local row.
- Local rows that are new or newer are reported as pending.
- Once the read model catches up, the ids match, so there's no duplicate.
- In the provider, local rows already win (it never replaces a row it holds), so this is the shared rule Phase 3 lists reuse.

**Freshness:**
- **stale:** never synced, or older than the 3 h SLO. Shows "Data may be out of date — last synced HH:MM".
- **updating:** this device wrote after the last sync. Shows "Updating…".
- **Source:** the user's own `sync_status` rows (one small Supabase read per mount).
- **In `firestore` mode it renders nothing and fetches nothing.**
- It's placed at the top of the Journal list header.

## Firestore mode is today's behaviour

- **The query is unchanged:** the Firestore month query is the old code, moved. A test pins the exact collection path, both `date` filters, the `logDirectRead` arguments and the soft-delete filter.
- **Nothing extra runs:** the provider's error handling and its state merge (local rows win, months-loaded bookkeeping) are untouched. The mode, the network state and duress go in through refs, so the loaders keep stable identities and no extra renders or fetches happen.
- **No badge:** it renders nothing unless the Journal is in `supabase` mode.
- **The setting can't be written by clients:** this is the existing rules test SEC-01 (`firestore/spendlySharedData.rules.test.ts`).

## Tests

| Test | Proves |
|---|---|
| `shared/utils/readModelReadPath.test.ts` (15) | **Mode resolver:** setting parsing, defaults, unknown values; duress, offline, no read model and a fallen-back session each give Firestore. **Overlay:** a pending local row is kept; a newer local edit wins with no duplicate; the overlay drops once synced; a newer remote version wins; an unknown version keeps local. **Freshness:** fresh, updating, stale past the SLO, and stale before the first sync |
| `lib/readModel/readPath.test.ts` (7) | Firestore mode never calls Supabase. Supabase serves. An error falls back for the session and is logged once. A timeout falls back within the budget. Shadow serves Firestore, logs diffs, and rate-limits them. No client means Firestore. The row comparison |
| `lib/readModel/journalReadPath.test.ts` (6) | **Firestore mode runs the previous query exactly and never connects.** An explicit `firestore` setting does the same. Duress and offline don't connect. Supabase mode reads the month, with no Firestore read, using the right filters, and filters locally removed ids. No client means Firestore |
| `scripts/readmodelSetMode.test.ts` (3) | Dry run by default; refuses unknown screens or modes; patches only `readModel.<screen>` |

Results (2026-10-22):
- `npm test` passes, as do `typecheck:shared` and full `tsc`.
- The repo has no ESLint config, so linting isn't run.

## Not done / open

- **"`shadow` in a test build"** (the Definition of Done): Spendly Test builds block every non-emulator backend by design (SPENDLY-175 network guard), so shadow can't reach Supabase there. Shadow runs in a normal dev or production build, with the read-model env set, once the sync is live: set `journal=shadow` and watch the `readModel.shadow.journal` logs.
- **Manual checks:**
  - toggle the mode;
  - stop Supabase mid-session and confirm the Firestore fallback, with no toast loop;
  - write offline, reconnect, and see "Updating…";
  - check the stale banner.

  These need the live read model and a device.
- **Moving the Journal screens themselves** (paging, reports, export) is SPENDLY-512; insights and other analytics are SPENDLY-513.
