# SPENDLY-595 — the Supabase plan: Free, with guardrails

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-595-free-plan` |
| Migration | `supabase-readmodel/supabase/migrations/20261105000000_readmodel_capacity.sql` |

## Decision (the user, 2026-11-04)

**No Supabase Pro. The epic runs on the Free plan, permanently. Cost: ₹0.**

The ticket was written for Pro: $25/month, daily backups and a restore drill. It is re-scoped to running safely on Free:

| The ticket assumed | On the Free plan |
|---|---|
| Daily backups, verified by a restore drill | **Rebuild instead of restore.** The read model is a copy: Firestore is written first and stays the source of truth, so a full sync (`mode=full`, drill D1) rebuilds every row |
| No pause | The project pauses after a week with no activity. The nightly sync and the hourly health count as activity. If it pauses anyway, health fails ("unreachable or paused"), every screen falls back to Firestore, and the app's outbox keeps its writes until Supabase answers |
| Pro's higher limits | The Free limits, **watched hourly** (below) |

## What's built

- **`readmodel_capacity()`** (migration `20261105000000`):
  - security definer, service role only;
  - numbers only: database size, Broadcast messages in the last 24 h (593's pings), and the five largest tables.
- **Hourly health** (`scripts/lib/readmodelHealth.ts`, `FREE_PLAN`), warning from 50% and failing from 80%:
  - **database size** against 500 MB;
  - **realtime messages** in 24 h × 30, against 2M a month.

  The summary shows both rows. Before the migration, or on any error, nothing is claimed ("—").
- **Runbook, "The Free plan":** each limit, how it's watched, and what to do if it's near. That covers egress and connections (a monthly dashboard check), pause handling, and rebuilding instead of restoring.
- **No Pro dependency left:** the ADR (D4), the plan, the post-merge checklist and 597 (its acceptance is "health's capacity checks green").

## Measured (2026-11-04)

- **Database:** 17 MB of 500 MB, with all 53 tables (most still empty until the backfill).
- **Expected after the backfill:** a few tens of MB.
- **The copy's hydrate:** about 21 MB of egress per 30K-transaction user, per device, once (594).

## Tests

- **`readmodelHealth.test.ts`:**
  - quiet well under the limits, with the summary rows;
  - warns at 50% (260 MB; 40K messages a day ≈ 60%);
  - fails at 80% (410 MB; 60K a day);
  - with no reading, nothing is claimed;
  - the loader includes `capacity`.
- **`assert_security` §10:** `readmodel_capacity` is security definer with an empty `search_path`, callable by the service role only (not anon or authenticated), and returns exactly the three numbers.

## Results

- `npm test` and `npm run test:rules` pass; `tsc` passes. The Read-model schema CI runs the SQL.

## After the epic reaches main

- Apply the migration with the others (it's additive, numbers only).
- Health shows the Free-plan rows; keep them green before every flip.
- Monthly: the dashboard's Usage page for egress and connections.
