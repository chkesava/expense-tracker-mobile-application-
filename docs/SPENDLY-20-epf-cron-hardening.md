# SPENDLY-20 — what `epf-cron` was hiding

[SPENDLY-20](https://kesavach.atlassian.net/browse/SPENDLY-20) · Bug ·
Medium / Observability + Data Integrity · epic
[SPENDLY-2](https://kesavach.atlassian.net/browse/SPENDLY-2)

Audit row **EPF-04** in
[`SPENDLY_FIREBASE_AUDIT_2026-09-12.md`](SPENDLY_FIREBASE_AUDIT_2026-09-12.md)
(line 150). Read [`EPF.md`](EPF.md),
[`KAN-67-epf-contribution-cron.md`](KAN-67-epf-contribution-cron.md) and
[`SPENDLY-72-epf-current-lifecycle.md`](SPENDLY-72-epf-current-lifecycle.md)
first — this is the decision record for hardening what those built.

---

## The audit is six days old and the file moved under it

The audit read the cron as it stood on 12 Sep. KAN-72, SPENDLY-1, SPENDLY-72 and
SPENDLY-19 have all landed since. Two of the five findings were already closed,
and one had **migrated to a different code path rather than being fixed** —
which is the most interesting thing in this ticket, because a reader working
only from the audit text would have marked it done and moved on.

| # | Audit finding | Status on 18 Sep | This ticket |
|---|---|---|---|
| 1 | Swallowed errors, no counter | Open. `:305` and `:366` bare `catch {}`; `:238` logged but counted nothing | **Fixed** |
| 2 | Unchunked batches | Partly open. Generation chunked by KAN-73; repair and release passes unchunked | **Fixed** |
| 3 | Auto-credit unconditional `set merge` | The auto-credit path **no longer exists** (SPENDLY-72). The identical hazard now lived in the lifecycle-release pass | **Fixed, at its new address** |
| 4 | UTC cron vs device-local client | **Already fixed** by KAN-72 | Verified only |
| 5 | `_duress` decoy trees; page headroom unmeasured | Open | **Fixed / instrumented** |

### Finding 4 needs no change, and the reason matters

`epf-cron.ts:160` and the client hooks both call `epfCurrentMonth()` from
`shared/features/epf/utils/epfClock.ts`, which formats in `Asia/Kolkata`. Server
and client agree by construction. `epfClock.test.ts` already pins the exact
00:00–05:30 IST disagreement the audit describes.

Note for anyone tempted to "improve" this: `shared/types/settings.ts` does carry
a `settings.timezone`, and it is **deliberately not used here**. It is the
user's device timezone. A user in London still has an Indian EPF account with
Indian month boundaries, so the statutory timezone is the correct one and the
user's is not.

### Finding 3 moved rather than disappeared

SPENDLY-72 deleted auto-crediting, so the `set(..., { merge: true })` the audit
names is gone and the response returns `credited: 0` forever. But SPENDLY-72
also added a **lifecycle-release** pass that withdraws invented credits and
releases stranded drafts — and it wrote `status: "expected"` with an
unconditional merge, based on a read taken earlier in the same request, plus an
audit event. That is the audit's finding exactly, one pass to the right:

> If the user records a credit between the cron's read and its write, the cron
> resets the status; `reconciledAt`/`creditedAmount` survive → a row that reads
> as one status with another status's amounts.

## What changed

### A precondition, not a transaction

The release pass now writes
`batch.update(ref, fields, { lastUpdateTime })`, with `updateTime` captured from
the read it already performs.

- **Cost.** A transaction re-reads every row. Per page that is 25 establishments
  × N rows × a round trip, sequentially, inside Netlify's synchronous limit —
  the very headroom finding 5 is worried about. The precondition costs no extra
  reads.
- **Correctness.** `lastUpdateTime` asserts *nothing has touched this document
  since I read it*, which is strictly stronger than re-checking the selector
  inside a transaction: the selector would happily miss an edit to a field it
  does not look at.
- **The audit event.** A `WriteBatch` is atomic, so a rejected precondition
  rejects the misleading "released to the scheduler" event along with the row.
  With per-row transactions that event would have to be hand-threaded into each
  one.
- **`update`, not `set`** — it also fails if the row was deleted, which is
  correct. There is nothing left to release.

**Accepted trade-off:** one contested row fails its entire chunk, up to 199
innocent releases with it. Nothing is written and nothing is corrupted; the rows
are counted and the next run retries. The chunk is 200 to bound that blast
radius, and this is a one-time SPENDLY-72 heal that should settle at zero within
a month or two. Finer granularity is not worth 25×N extra reads.

A row whose target id is not in the read has no safe precondition, so it is
skipped rather than written blind. The repair pass runs first and can invalidate
a precondition the release pass is about to use, so it carries its own
`WriteResult.writeTime` forward into the map — otherwise a row in both passes
would fail on a precondition the cron itself broke, and wait a month.

### The credit-window repair keeps its merge, on purpose

It writes `expectedCreditFrom`, `expectedCreditTo` and `updatedAt` — no status.
Both window values are a pure function of `row.month` via
`creditWindowRepairFor`, and neither is editable by the user anywhere in the
app. A merge there cannot clobber an edit, because the only values it writes are
already determined. It needed the chunking and the failure counting, not a
precondition.

### Errors are classified, not swallowed

`shared/features/epf/utils/cronOutcome.ts` (new, pure, unit-tested — `netlify/**`
is outside `vitest.config.ts` and stays that way, so the handler remains a thin
shell as KAN-67 designed it):

- **Benign** = another writer got there first: `ALREADY_EXISTS` (the
  `batch.create` idempotency design working), `FAILED_PRECONDITION` (the release
  pass correctly refusing to overwrite a user edit — a *success*, not a fault)
  and `NOT_FOUND` (the row was deleted). Counted as `skipped`, logged at `warn`.
- **Fatal** = everything else, *including anything unrecognised*:
  `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT` (the over-sized
  batch this same ticket fixes), `ABORTED`, `UNAVAILABLE`. Counted as `failed`,
  logged at `error`.

Defaulting the unknown to fatal is the load-bearing decision: it is what stops a
failure mode nobody anticipated from reopening this ticket in silence.

`classifyFirestoreError` must only ever be pointed at a **commit** error. On a
query, `FAILED_PRECONDITION` means a missing index and is emphatically fatal.

Logs are one JSON line carrying `stage`, `uid`, `establishmentId`, `month`,
`rows`, `kind`, `code` and `message` — enough to find an establishment that
keeps failing, and no stack and no amount, because a cron log is not the place
for either.

### 200 with a `failed` count, not a 5xx

`epf-cron.yml` exits 1 on any non-200 and abandons the remaining pages. A 5xx on
page 3 would therefore cost **every user on pages 4..N their month** because one
establishment was broken. So the function always answers 200 for
per-establishment failures and reports `failed`; 5xx is reserved for
whole-request failures (missing `FIREBASE_SERVICE_ACCOUNT`, an unparseable body,
the collection-group query itself).

The workflow annotates each failing page as it goes, finishes every page, and
then fails the run if the total is non-zero. A benign collision only moves
`skipped`, so a healthy race never reds the run.

### Two more defects found while reading

- The generation loop did `break` on a commit error, abandoning every remaining
  month for that establishment until the next monthly run. It now classifies and
  continues.
- Both in-memory mirrors (`row.expectedCreditFrom/To`, `row.status`) were
  assigned **before** their commit, so a failed commit left the rest of the run
  reasoning about state that was never persisted. They now run after the commit
  and only over what landed. This could not double-write today —
  `monthsToGenerate` already drops months present in `existing`, so the
  `canOverwriteWithSimulated` branch is unreachable from the cron — but it
  corrupted the `repaired` count and would have become a live bug on the next
  change to the planner.
- `repaired` conflated window repairs with lifecycle releases, under a step
  summary labelled "Credit windows repaired". They are now `repaired` and
  `released`, and the label is true.

### `_duress`

The collection group sweeps `users/{uid}_duress/epfEstablishments` — decoy trees
that paid for two unbounded reads each. The skip happens **before** those reads.
It cannot be pushed into the query (no uid predicate is expressible), so a decoy
still consumes a page slot; `duressSkipped` in the response makes that honest
rather than invisible.

The `_duress` suffix was a bare literal in six places. It now lives in
`shared/utils/duress.ts` — **zero imports**, because it is pulled into the
Netlify CJS bundle and anything ESM-only reaching that bundle reproduces the
KAN-36 `ERR_REQUIRE_ESM` crash. (`lib/authHelpers.ts` could not be reused for
exactly that reason: it imports `firebase/auth`.) `lib/authHelpers.ts` and the
cron use it; the four `services/sms/*` guards were left alone as out of scope
for a cron ticket.

`firestore.rules:21` writes `request.auth.uid + '_duress'` and cannot import
anything. `lib/duressPath.contract.test.ts` pins the constant to that literal —
it is the only thing that notices if the two drift.

### Page headroom

The response now carries `elapsedMs` and `maxEstablishmentMs`; the workflow
reports the slowest page. `DEFAULT_PAGE_SIZE` stays **25** — the point is to
measure first.

Decision rule: raise it only after two consecutive monthly runs where the
slowest page stays under 40% of the function timeout. And be prepared to
*lower* it: 25 establishments × (2 unbounded reads + up to 3 commits), all
sequential in a synchronous Netlify function, has never actually been timed.

## Files

| File | Change |
|---|---|
| `shared/utils/duress.ts` *(new)* | `DURESS_UID_SUFFIX`, `duressUid`, `isDuressUid` — zero imports |
| `shared/features/epf/utils/cronOutcome.ts` *(new)* | `classifyFirestoreError`, `cronFailureLog` |
| `shared/features/epf/data/epfBatchLimits.ts` | `EPF_BATCH_SAFE_WRITES` and the repair/release chunk sizes |
| `netlify/functions/epf-cron.ts` | Duress skip, chunking, precondition, error accounting, timing |
| `.github/workflows/epf-cron.yml` | New counters, per-page annotation, fail-at-end gate |
| `lib/authHelpers.ts` | Uses `duressUid` |

## Tests

| File | |
|---|---|
| `shared/utils/duress.test.ts` *(new)* | 6 — incl. suffix-not-substring |
| `shared/features/epf/utils/cronOutcome.test.ts` *(new)* | 13 — benign/fatal per code, unknown → fatal, log shape carries no stack |
| `shared/features/epf/data/epfBatchLimits.test.ts` | +4 — incl. the regression: a 1000-row unchunked repair against a 500 cap |
| `lib/duressPath.contract.test.ts` | +2 — auth proxy agrees with the helper; the rules literal is pinned |

Full suite **2872 unit**, both typechecks clean, and the CJS load check that
matters for a new `shared/` module in the bundle:

```bash
npm run build:netlify-fns
npm install --omit=dev --prefix netlify/functions-dist
node --no-experimental-require-module -e "require('./netlify/functions-dist/epf-cron.js')"
```

Verified locally against the bundled function: no secret → 401, wrong secret →
401, GET → 405, correct secret with no service account → 500.

**Not unit-testable, and manual for the same reason as KAN-67:** the handler
body, the workflow shell, and the `lastUpdateTime` behaviour itself — there is
no emulator harness for admin-SDK batches in this repo.

## Manual testing guide

1. Trigger `epf-cron.yml` → the summary shows the new counters; `failed` is 0
   and the run is green.
2. Trigger it twice → the second run reports `written: 0` and stays green. A
   benign collision must never red the run.
3. Confirm a `_duress` establishment increments `duressSkipped` and that nothing
   is written under `users/{uid}_duress/epfContributions`.
4. The precondition: with a row the release pass would touch, edit it from the
   app between the cron's read and its write. The cron must leave it alone, and
   there must be **no** audit event for a status change that did not happen.
5. The EPF screen still shows the current month as Expected with its credit
   window, and an already-credited month is untouched by a run.

## Known limitations

1. **Decoy trees still consume page slots.** Only the reads were saved.
2. **The two per-establishment reads remain unbounded** — every sibling
   establishment and every contribution row, on every run. Out of scope here;
   see the realtime rows of the 2026-09-12 audit.
3. **Nothing is verified against the deployed function.** Automated tests, a
   local CJS load and a local auth smoke-test only.
4. **`firestore.rules` still hand-writes `'_duress'`.** A contract test is the
   only link.
5. **A contested chunk fails whole.** By design; see the trade-off above.
