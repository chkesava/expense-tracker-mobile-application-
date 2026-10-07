# SPENDLY-417: Prevent CC Bills from showing already-paid historical bills as overdue

## State
Implemented, pending user review and merge to `main`. Backfill not yet run.

## Root cause
Not a single bug — two gaps in `creditCardBills` reconciliation let a settled
cycle keep showing `OVERDUE`:

1. **Stale `status` field.** `computeCreditCardBillStatus` is correct and
   pure, but `CreditCardBillsProvider`'s Firestore snapshot mapper only ever
   recomputed `status` when the field was *missing* on the doc — once a
   `status` value existed it was trusted forever, even if `amountPaid` was
   later corrected without a parallel status recompute.
2. **Duplicate bill docs** for the same `accountId` + `statementDate`
   (tracked separately as SPENDLY-45, `scripts/detect-duplicate-credit-card-bills.js`).
   Reconciliation (`collectCreditBillAllocationPatches`) and the ledger only
   ever claim one doc per cycle; a payment linked to the other duplicate
   never reaches it, so it keeps its original (often unpaid/overdue) fields
   forever.

## Fix
- `shared/utils/creditCardLedger.ts`
  - `collectCreditBillAllocationPatches` now also forces a patch when the
    ledger-reconciled amount implies `PAID`/`PARTIALLY_PAID` but the stored
    `status` disagrees — even if `amountPaid`/`paymentIds` need no change.
    Deliberately narrow: it never forces a pure date-driven transition (e.g.
    `UPCOMING` → `OVERDUE` for a genuinely unpaid bill) — that stays out of
    scope.
  - New `collectCreditBillDuplicateResolutions(bills, today)`: groups bills
    by `accountId` + `statementDate`, merges every duplicate group onto one
    canonical doc (the deterministic auto-bill id when present in the group,
    else the one with the highest `amountPaid`), and reports the rest for
    cancellation. Never deletes a doc or touches `AccountPayment`s; pure and
    idempotent.
- `providers/CreditCardBillsProvider.tsx`
  - The Firestore snapshot mapper now always recomputes `status` live from
    `amountPaid`/`statementAmount`/`dueDate` (trusting only an explicit
    `CANCELLED`), instead of trusting whatever is stored whenever present.
    This alone fixes the bug for the UI on every read, independent of when
    reconciliation last ran.
  - `generateAutoBills()` now also runs `collectCreditBillDuplicateResolutions`
    (same trigger as the existing allocation-patch pass: app open/foreground,
    gated by the existing fingerprint, which now also covers duplicate
    resolutions) and writes the merge/cancel updates through the same
    `commitWrite`/`updateDoc` path as the rest of the function.
- `scripts/reconcile-credit-card-bill-payments.js` (new): one-time backfill
  for data already wrong in Firestore before a user reopens the app. Scoped
  to the two corrections that need only each bill's own stored fields
  (status recompute + duplicate merge) — it deliberately does **not**
  re-derive the full payment ledger, since that logic is non-trivial, already
  covered and tested in `shared/utils/creditCardLedger.ts`, and hand-porting
  it to a standalone Node script would duplicate and risk drifting from it.
  The app itself self-heals the ledger-dependent case (an unlinked legacy
  payment that needs `amountPaid` raised) automatically on each user's next
  app open via the existing `generateAutoBills` pass — no backfill needed for
  that part.

## Tests
- `shared/utils/creditCardLedger.test.ts`: all 53 existing tests still pass;
  added:
  - `corrects a stale OVERDUE status when the linked amount already covers the bill (SPENDLY-417)`
  - `does not force a status patch for a genuinely unpaid bill drifting from UPCOMING to OVERDUE`
  - `collectCreditBillDuplicateResolutions` suite (4 cases: merge + cancel,
    idempotent re-run, single bill untouched, ignores already-CANCELLED docs)
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm test -- --run`: 5436 passed, 3 failed — all 3 pre-existing and
  unrelated (missing vendor files for `expo-navigation-bar`/
  `expo-quick-actions` in this worktree's `node_modules`; not touched by this
  change).

## Not yet done
- Backfill (`scripts/reconcile-credit-card-bill-payments.js`) has not been
  run against production. Needs a dry-run report shown to and approved by
  the user before `--apply` (per `docs/AGENT_WORKFLOW.md` §7 — shared
  Firebase, no staging).
- Manual device/emulator QA against a seeded historical paid bill (per
  `docs/LOCAL_TEST_MODE.md`) has not been performed in this session.
- Merge to `main` requires user sign-off (this is a standalone bug fix, not
  part of an epic branch, so it merges directly via PR once approved).

## Commit
`fix(SPENDLY-417): reconcile stale status and duplicate credit card bills`
on `feature/SPENDLY-417-cc-bill-payment-reconciliation` (worktree
`.claude/worktrees/spendly-417-cc-bill-reconciliation`, cut from `main`).
