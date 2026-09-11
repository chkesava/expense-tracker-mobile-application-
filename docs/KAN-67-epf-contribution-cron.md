# KAN-67 — EPF: Current Contributions & Automated Credit Cron

| | |
|---|---|
| **Jira** | [KAN-67](https://kesavach.atlassian.net/browse/KAN-67) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-67-epf-contribution-cron` |
| **Date** | 2026-09-11 |
| **Builds on** | [KAN-65](./KAN-65-epf-data-model.md), [KAN-66](./KAN-66-epf-historical-contributions.md) |
| **Rollout** | [KAN-78](https://kesavach.atlassian.net/browse/KAN-78) — required before this does anything in production |

## Why

KAN-66 covers past employment. This is the forward half: the current employer's
contribution should appear each month on its own, with an expected credit window
in the following month, and must never be generated twice or generated for an
employer someone has already left.

### The blocker that turned out not to be one

`docs/KAN-65-epf-data-model.md` recorded this ticket as **blocked**: Firebase
Cloud Functions are undeployable on the Spark plan and there was no other
scheduler. That was too narrow. **Netlify already runs live server code for this
repo** — `netlify/functions/ganesh-summary.ts`, with firebase-admin and a service
account. The same machinery runs this job. That open item is now closed.

## Why GitHub Actions provides the clock

This is the decision that shapes the ticket, and it is forced by how deployment
already works.

`.github/workflows/web-deploy.yml` copies the build out of the repo and runs
`netlify deploy --prod --dir … --functions …` from `$RUNNER_TEMP`, deliberately
**outside the repo so no `netlify.toml` is ever picked up** — a stray one would
drop `/expense`, `/ganesh` and `ganesh-summary`. Consequently:

- `[functions."x"] schedule = …` in `netlify.toml` is **never read**.
- The in-code `schedule()` wrapper from `@netlify/functions` is detected by
  *Netlify's* bundler, which this setup bypasses in favour of
  `scripts/bundle-netlify-fns.js` — a custom esbuild step that exists because
  `firebase-admin` → `jwks-rsa` → `jose@6` is ESM-only and crashes Netlify's CJS
  runtime. A new admin function hits the same wall.

So **Netlify still does the compute** and GitHub Actions supplies the clock.
That works with the existing architecture rather than against it, reuses the
proven function shape, and for a job that fires twelve times a year it also buys
a manual "Run workflow" button plus free retry and log history.

### Timeout is handled by pagination

Netlify's synchronous limit is low and background functions are plan-dependent.
The function therefore processes **one bounded page per invocation** and returns
`{ processed, written, nextCursor }`; `.github/workflows/epf-cron.yml` loops
until `nextCursor` is null, capped at 200 pages. No timeout risk, no plan
dependency, and a failed page simply retries next month.

## Architecture

### One generator, two callers

`shared/features/epf/utils/schedule.ts` holds every decision, and both the
Netlify function and the client catch-up call it — so server and client cannot
disagree about which months are owed or what they contain.

| Function | Purpose |
|---|---|
| `selectEstablishmentForMonth` | The job-change rule |
| `monthsToGenerate` | Which months are owed, bounded by employment and the cut-off |
| `expectedCreditWindow` | `{ from, to }` in the **following** month |
| `wageForProjection` | Most recent recorded wage, or 0 |
| `buildExpectedContribution` | An `expected` / `simulated` row |
| `planScheduledContributions` | The single entry point |

The ticket's August/September scenario is a **unit test of
`selectEstablishmentForMonth`**, not an integration test — which is what makes it
cheap to assert exhaustively.

### Idempotency, in four layers

1. **Deterministic id** from KAN-66 — `{establishmentId}_{YYYY-MM}`. A repeat run
   is a key collision, not a duplicate.
2. **Existing months are read first** and skipped; `monthsToGenerate` returns
   nothing on a second run.
3. **`batch.create`, not `set`** — if a row appeared between the read and the
   write (a concurrent client catch-up, say) the batch throws and that
   establishment is skipped rather than clobbered.
4. **Protected sources** — `canOverwriteWithSimulated` refuses to touch a row
   whose `source` is `manualHistorical` or `imported`. This is the contract
   KAN-66 recorded, now enforced in code.

### Credit window

`shared/features/epf/data/epfCreditWindow.ts`, effective-dated like the KAN-66
rate table. The window always lands in the month **after** the contribution
month, and days are clamped to that month's length so a rule day of 31 can never
produce an impossible date. `month`, `expectedCreditFrom`/`expectedCreditTo` and
`creditDate` are three distinct fields — the separation the ticket insists on.

Month arithmetic uses `YYYY-MM` keys and `shiftMonthKey`, and the function
derives the current month in **UTC**, so there is no timezone ambiguity.

## Scope: KAN-67 generates, KAN-68 transitions

The ticket's point 5 — moving Expected to Credited — is KAN-68's job. This
ticket creates `expected` rows against the right establishment and month; the
lifecycle after that (Credited / Missed / Partial and reconciliation) belongs to
the next ticket. That keeps the seam clean and this ticket shippable alone.

## Files

| File | Role |
|---|---|
| `shared/features/epf/data/epfCreditWindow.ts` | Effective-dated credit window |
| `shared/features/epf/utils/schedule.ts` | All scheduling logic |
| `netlify/functions/epf-cron.ts` | Paginated generator; a thin shell over `shared/` |
| `scripts/bundle-netlify-fns.js` | Generalised bundler (replaces the single-function script) |
| `.github/workflows/epf-cron.yml` | Monthly trigger + manual dispatch |
| `.github/workflows/web-deploy.yml` | Bundles and load-checks both functions; sets `EPF_CRON_SECRET` |
| `hooks/useEpfCatchUp.ts` | Client-side catch-up on the EPF tab |
| `firestore.indexes.json` | Collection-group index on `epfEstablishments.employmentStatus` |

## Security

- The function authenticates with a **constant-time comparison** of
  `x-epf-cron-secret` against `EPF_CRON_SECRET`, checked **before anything
  touches Firestore**. There is no user ID token for a cron.
- It uses admin credentials and therefore bypasses security rules entirely —
  which is why the collection-group query is scoped to
  `employmentStatus == "current"` rather than sweeping the whole user base.
- Without the secret the function answers 401 to everything, so the job is inert
  until KAN-78 provisions it. That is also the kill switch.

## Tests

| File | Count |
|---|---|
| `shared/features/epf/utils/schedule.test.ts` | 31 |
| `shared/features/epf/data/epfCreditWindow.test.ts` | 7 |
| `firestore/personalData.rules.test.ts` | +2 (`epfMeta`) |

Full suite: **2002 unit**, **164 rules**, both typechecks clean.

**Not unit-testable:** the function handler and the workflow —
`netlify/functions/**` is outside `vitest.config.ts`. That is precisely why the
handler is a thin shell. The one mechanical check that *is* reproducible locally
is the CJS load, and it matters more than it looks:

```bash
npm run build:netlify-fns
npm install --omit=dev --prefix netlify/functions-dist
node --no-experimental-require-module -e "require('./netlify/functions-dist/epf-cron.js')"
```

That is the exact failure KAN-36 spent four commits on. Both functions were
verified to load before this branch was pushed, and CI now checks both.

## Rollout — nothing works until KAN-78

Merging this changes **nothing in production**. `web-deploy.yml` is
`workflow_dispatch` only, and rules/indexes are never deployed by CI. See
[KAN-78](https://kesavach.atlassian.net/browse/KAN-78): set `EPF_CRON_SECRET`,
deploy the collection-group index **before** the first run, run the deploy
workflow, smoke-test for a 401, then trigger once and confirm idempotency.

## Known limitations

1. **A wage is required to project.** The generator uses the most recent
   recorded month's wage; with none it writes nothing rather than inventing a
   number. A user who has never recorded a month sees nothing until they do.
2. **Collection-group query is new ground here** — nothing in this repo has run
   one server-side. Without the index the function throws on its first Firestore
   call, which is why the index deploy is ordered before the first run.
3. **Secret rotation touches two places**, GitHub secrets and Netlify env.
4. **Not verified on device or against the deployed function.** Automated tests
   and a local CJS load check only.

## Manual testing guide

1. With a current establishment and at least one recorded month, open the EPF
   tab → the current month appears as **Expected**, with a credit window in the
   following month.
2. Close that establishment with a leaving date in the past, reopen → **no new
   month** is generated for it.
3. Add a new current establishment starting this month → the month is generated
   against **it**, not the old one.
4. Backfill the current month by hand first, then reopen → the manual row is
   **untouched**.
5. Trigger `epf-cron.yml` twice → the second run reports `written: 0`.
6. Call the function with no secret header → **401**, not a `jose` /
   `ERR_REQUIRE_ESM` crash and not 404.
