# SPENDLY-509: backfill and reconciliation, verified by count parity

[SPENDLY-509](https://kesavach.atlassian.net/browse/SPENDLY-509) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-509-backfill-reconciler`, cut from the epic branch after SPENDLY-508 was merged.
- Runbook: `docs/READMODEL_RUNBOOK.md`, section "Backfill".

## Re-scope for option C

SPENDLY-506 already settled this: **the first full run is the backfill, and the nightly full run is the reconciler.** Everything the ticket asked of a backfill or reconciler maps onto 506's full mode:

| Ticket acceptance criterion | Delivered by |
|---|---|
| An interrupted backfill resumes, and the final counts are exact | 506: per-run resume point, no high-water advance on an incomplete pass, idempotent re-runs. **Exactness is now checked by the count-parity step** |
| A doc edited during the backfill ends at the latest state, with no duplicate | 506: upsert keyed on (uid, doc id), version-guarded on `updateTime` |
| A replayed page changes nothing | 506: same updateTime is a no-op (`sync_functions.sql`) |
| A manually deleted Postgres row is restored by the next compare | 506's full run. **Proven end to end on the emulator in this story** |
| A Firestore hard delete missed earlier is tombstoned | 506's full run (after a complete pass, with the mass-delete guard) |
| A dry run writes nothing and reports the intended actions | 506 `--dry-run` |
| An unauthenticated call returns 401 | **N/A:** there is no endpoint, because the job runs on GitHub Actions with secrets |

A Netlify `readmodel-reconcile` function was **not built**. It would duplicate the above and spend Netlify Free credits.

## What was built: independent count parity

The full sync's own bookkeeping can't prove itself complete. This check uses a different path: Firestore's `count()` aggregation per (uid, collection), compared with the read model's live rows.

| Piece | What |
|---|---|
| `supabase-readmodel/supabase/migrations/20261025000000_readmodel_verify.sql` | `readmodel_live_counts()`: live (non-tombstoned) rows per (uid, Firestore collection name) in one call. **Service role only.** Also adds the `verify` run mode |
| `scripts/lib/readmodelVerifyCore.ts` | Pure, with ports. Counts every (non-duress) user × Wave 1 collection, bills reads as Firestore does (1 per started 1,000 docs, minimum 1), and stays within its own and the shared daily budget. It records both counts in `sync_status.source_count/model_count` and fails on any difference. The report is by collection; no uids |
| `scripts/readmodel-verify.ts` | CLI: Firestore `count()` (read-only) plus the Supabase sink. Writes a step summary and exits 1 on a mismatch |
| `.github/workflows/readmodel-sync.yml` | A **Verify count parity** step after every real full run (the nightly schedule, or `mode=full`, `dry_run=false`), and on demand with `mode=verify` |
| `scripts/lib/readmodelHealth.ts` | Red when the latest verify (within 26 h) failed, naming the collections. A later passing verify clears it |

**Cost:** at today's size (24 users × 10 collections, almost all under 1,000 documents), about **250 Firestore reads per night**. That's inside the 12K/day budget, together with the sync's ≈ 8–9K.

## Tests

| Test | Proves |
|---|---|
| `supabase-readmodel/tests/verify.sql` (CI and local PG18) | Tombstoned rows don't count; Firestore collection names are used; the `verify` mode is allowed; clients can't call it |
| `scripts/readmodelVerify.test.ts` (8) | Match passes and records both counts for every pair. A missing row fails, naming the collection, with no uid in the logs. An extra row fails. A duress tree is never counted. Read billing (`countReads`) and the budget stop. The shared daily budget. A read error is a failed run, not a crash. Summary by collection with no uids |
| `scripts/readmodelHealth.test.ts` (+1, 14 total) | A failed verify within 26 h is a problem naming the collections; a later passing verify clears it |
| `firestore/readmodelSync.emulator.rules.test.ts` (+1) | The real `count()` on the emulator agrees after a full sync: 600 categories counted for 1 read. A row deleted by hand in the copy is caught, the next full sync restores it, and verify agrees again |

Results (2026-10-22):
- The SQL chain passes on local Postgres 18.
- The emulator tests pass (2).
- `npm test` passes, as do `typecheck:shared` and full `tsc`.
- The script files were typechecked with a temporary config.

## Definition of Done

- **"Production backfill complete with an approved dry-run":** the user follows the runbook's Backfill section. The dry-run figures are already in SPENDLY-506 (4,024 reads, 3,807 docs, 0 unmapped).
- **"Schedules green for 7 days":** after `READMODEL_SYNC_ENABLED=true`. This runs alongside 506's 7-day check.
