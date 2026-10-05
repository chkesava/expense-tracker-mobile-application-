# SPENDLY-389 — effective-dated EPF wage changes

[SPENDLY-389](https://kesavach.atlassian.net/browse/SPENDLY-389) · Story ·
High · under epic SPENDLY-3 (EPF Tracking & Simulation)

Read [`EPF.md`](EPF.md) first.

---

## What was missing

Before this ticket, `wageForProjection()` in `shared/features/epf/utils/schedule.ts`
took the wage off whichever existing `EpfContribution` document had the
highest `month`, and `planScheduledContributions` applied that **one** wage
to every month it generated in a run. There was no way to say "the raise
starts in September" ahead of time — the new wage only ever took effect once
someone recorded a month with it by hand, and a run spanning a raise mid-way
through would have applied the wrong wage to half its months.

`EpfContributionEditSheet` (Backfill) already had full wage/share editing,
"Recompute from wage", and an `overridden` flag derived by diffing saved vs.
computed shares — all reused as-is. `EpfCurrentContributions` had no
wage-editing affordance at all.

## What this adds

1. **`epfWageHistory`** — a new collection, `users/{uid}/epfWageHistory/{id}`,
   one document per wage change: `establishmentId`, `effectiveFromMonth`
   (`YYYY-MM`), `wage`, `epsEligible`, optional
   `employee/employer/eps/employerEpfShareOverride`, `rulesVersion`, `notes`,
   `createdAtMs`/`updatedAtMs`. See `shared/features/epf/types/index.ts`.
2. **`wageForMonth(history, month, fallback)`** (`shared/features/epf/utils/wageHistory.ts`)
   — the newest `effectiveFromMonth <= month` wins, mirroring
   `findEpfContributionRule`'s statutory-slab resolution. Falls back to
   `wageForProjection(existing)` when no entry applies yet, so an
   establishment with no wage-history entries keeps projecting exactly as it
   did before this ticket.
3. **`planScheduledContributions`** now takes an optional `wageHistory` and
   resolves the wage **per generated month** rather than once for the whole
   run — a raise effective partway through a window changes only the months
   from that point on. Both the Netlify cron (`netlify/functions/epf-cron.ts`)
   and the client catch-up (`hooks/useEpfCatchUp.ts`) load `epfWageHistory`
   and pass it through.
4. **`EpfWageChangeSheet`** — a new sheet (sibling to `EpfCreditSheet`, not a
   reuse of `EpfContributionEditSheet`, which stays Backfill-only) opened from
   a "Change wage" action on `EpfCurrentContributions`. Shows the current
   wage, a new-wage/effective-month form, a live `computeEpfContribution()`
   preview, and optional manual overrides when actual payroll differs.
5. **Confirmation, not silent overwrite.** The automated scheduler already
   refuses to touch `manualHistorical`/`imported`/confirmed/credited rows
   (`canOverwriteWithSimulated`/`isEligibleForAutomatedProcessing`) — those
   were never at risk. `wageChangeNeedsConfirmation()` is a client-side
   explainer: when the chosen effective month already holds such a row, the
   sheet confirms with the user before saving that it will **not** change,
   since the new wage only reaches months that are still a projection.
6. **Firestore rules** — `epfWageHistory` follows the repo's stricter
   `hasOnly` + pinned-field pattern (`merchantOverrides`'s pattern), not the
   looser one `epfContributions`/`epfEstablishments` use: `establishmentId`,
   `effectiveFromMonth` and `createdAtMs` are pinned on update, so a wage
   change cannot be silently repointed at a different establishment or month.

## Decisions

### Resolve wage per month, not once per run

`planScheduledContributions` previously called `wageForProjection` once and
used the result for every month `monthsToGenerate` returned. That was already
masked in practice — `isEligibleForAutomatedProcessing` only ever lets the
*current* month (`throughMonth`) through in one run — but it was still the
wrong contract to build effective-dating on top of. `wageForMonth` is now
called once per candidate month, so the design is correct even though today's
single-month-per-run behavior means it is rarely exercised across more than
one month in practice; the regression tests in `schedule.test.ts` drive each
month through its own call for exactly this reason.

### `createdAtMs`/`updatedAtMs`, not `serverTimestamp()`

Every other EPF collection uses Firestore `serverTimestamp()` for
`createdAt`/`updatedAt`. Wage history uses epoch-ms numbers instead, written
client-side with `Date.now()`, because the security rule pins
`establishmentId`/`effectiveFromMonth`/`createdAtMs` on update — a
`serverTimestamp()` sentinel is unresolved at the point the rule evaluates an
update and cannot be compared against the stored value. This is the same
convention `MerchantOverride`/`AccountNotes` already use for the same reason.

### No "apply to month" write path

The sheet only ever writes a new `epfWageHistory` entry. It does not also
force-rewrite the contribution row at the effective month, even when that row
is still a safe-to-touch draft/simulated projection — the scheduler and the
client catch-up already pick up the new wage schedule the next time either
runs (on next app foreground/mount, or the next cron tick), which is the same
eventual-consistency window every other wage edit in this codebase has always
had. Forcing an immediate synchronous rewrite from the sheet would duplicate
`planScheduledContributions`'s write path for no behavioral gain.

## Test plan

- `shared/features/epf/utils/wageHistory.test.ts` — `wageForMonth` resolution,
  validation, preview/override diffing, confirmation gating, normalize/write
  round-trip.
- `shared/features/epf/utils/schedule.test.ts` — new
  `planScheduledContributions` cases: old wage before the effective month, new
  wage from the effective month, multiple wage changes picking the right
  slab, fallback when no entry applies yet.
- `firestore/epfWageHistory.rules.test.ts` — well-formed create/update,
  schema pollution, bad month format, negative wage, pinned-field mutation
  rejected on update, stranger isolation.
- `firestore/personalData.rules.test.ts` — `epfWageHistory` added to the
  generic owner/stranger list-access loop and the validated-without-amount
  group.
- Manual device QA (pending): Spendly Test on the Firebase emulator, create a
  wage change effective a future month, confirm prior months unchanged on
  Current/Backfill/History, confirm the projected balance/interest simulation
  updates from the effective month onward.

## Verification run (2026-10-05)

- `npx vitest run shared/features/epf` — 607 passed.
- `npm run typecheck:shared` — clean.
- `npx tsc -p tsconfig.json --noEmit` — clean except a pre-existing,
  unrelated `shared/utils/whatIf.qa.test.ts` error on `main` (confirmed by
  diffing against `main` directly; not touched by this story).
- `npm test` — 5421 passed; 3 pre-existing failures in
  `scripts/metroQuickActionsResolution.test.ts`, unrelated to EPF.
- `npm run test:rules` — 530 passed across all 25 rules test files.
- Android device QA: not yet run.
