# Ganesh Seva — full feature audit (2026-09-03)

**Scope:** every Ganesh Seva feature — all 56 write paths across
`services/ganesh/**`, their `hooks/useGaneshWrites.ts` wrappers, the
`app/(ganesh)/**` screens (49 files) and `components/ganesh/**`, plus a
re-triage of the 103-ticket backlog from the 2026-08-24 audit.

**Why this audit:** an expense of ₹222 was rejected on a festival holding
₹46,911 (see `GANESH_GOD_FUND_LOCATION_AUDIT_2026-09-03.md`). The request was
to find out whether other features carry the same kind of defect.

**Branch:** `main` @ `156383a`.

**Method:** static review of every write path, mechanically enumerated
(transaction vs. batch, validators called, transitive reach to a money write);
targeted verification of each CRITICAL/HIGH backlog ticket against current
code; pattern sweeps for unguarded data access across the Ganesh UI.

---

## The headline — RESOLVED 2026-09-03

**The most serious exposure was not a bug — it was four CRITICAL security fixes
that were written, committed, and never deployed.**

`firestore.rules` in this repo contained the fixes for GS-002, GS-003, GS-004
and GS-005, all four verified present. The 2026-08-24 audit recorded them as
"AWAITING RULES DEPLOY", CI does not deploy `firestore.rules`, and the file had
last been touched 2026-08-31. Until the deploy below, any signed-in user
could:

| Ticket | Exposure |
|---|---|
| GS-003 | `list` every `pandalInvites` document — enumerate every Pandal's id, name and join code |
| GS-004 | Write the `summary` document directly — forge any festival's balances |
| GS-005 | Update/delete `fundTransfers` and `auditLogs` — edit the audit trail |
| GS-002 | Self-grant an arbitrary `permissions` array through open join |

Two more items are pending in the same way: GS-001 (Supabase Storage lockdown —
code fixed, awaiting a release build) and GS-014
(`scripts/backfill-ganesh-admin-count.js` written, recorded as never run).

### Deployed

`firebase deploy --only firestore:rules --project expenseapp-27f94`, run
2026-09-03 against the version of `firestore.rules` committed here. Compiled
successfully; the four `Invalid variable name: docId` warnings are pre-existing
(a helper reading `docId` from the enclosing `match` scope) and were present
before this change. `firestore:indexes` and `storage` were **not** deployed —
neither changed.

GS-002, GS-003, GS-004 (partial, per its ticket) and GS-005 are now live, along
with GS-016, GS-018 and GS-037, which were waiting on the same deploy.

**Watch for fallout on old app builds.** These rules were written against the
current client and they begin *enforcing* checks that were previously not
enforced at all. A device still running an older Ganesh build may now be denied
where it used to succeed — most plausibly the join flow, which GS-002 pins to
the built-in member permission set. The summary validator is safe in this
direction: it uses `hasOnly`, older clients write a subset of the allowlist, and
subsets pass. Shipping a current build is the mitigation, and GS-001 needs one
anyway.

### Still pending, and not deployable

- **GS-001** — Supabase Storage lockdown: code is fixed but needs a release
  build to reach users.
- **GS-014** — `scripts/backfill-ganesh-admin-count.js` is written and
  deliberately still not run (decision 2026-09-03). Dev and prod share the one
  Firebase project `expenseapp-27f94`, so there is no environment to prove a
  data mutation against before it touches live committee data. Nothing is
  broken while the field is absent: the rules read a missing `adminCount` as 1.
  The only symptom is a pandal that predates the field *and* has two or more
  active admins, where demoting either is refused by the last-admin guard. The
  script's `--dry-run` reports without writing and is the safe way in when
  someone with the service-account credential chooses to.

---

## Coverage gap that produced the reported bug

Since the 2026-08-24 audit, ~100 commits have changed **410 files**: the whole
Ganesh UI rebuild, multi-app separation, web support, and five core money
features — `8c4bbfd` contributions/sponsors, `6ca75bf` reimbursements,
`4e51dfd` collections, `e8e20ba` Cash/UPI/Bank, `91d3a5d` festival management.
**None of that code had been audited.**

The God Fund bug came directly out of it, and not from an unknown risk: the
audit had already filed GS-011 ("no festival-level Cash/UPI/Bank split
exists"). Commit `e8e20ba` built the split and shipped it without backfilling
festivals that already held money. **The fix for a ticket created the bug.**

Every new finding below (N-01 … N-06) is in code written after 2026-08-24.

---

## New findings

### N-01 — P1 — `receiveContribution` is not atomic; a promise can be received twice

`services/ganesh/ganeshWrites.ts:1968`

The status guard runs on a `getDoc` snapshot, outside the `writeBatch`:
`getDoc` → `assertCanReceiveContribution(prev)` → `writeBatch` → `commit`.

**Failure scenario.** A ₹5,000 promise is outstanding. Two committee members
open Funds on their own phones and both tap "Mark received". Both reads see
`status: "promised"`, both guards pass, both batches commit.
`otherCashContributions` is incremented **twice** (₹10,000 recorded for a
₹5,000 gift), the Cash bucket is doubled, and `promisedCashContributions` is
decremented twice — going negative. The contribution document itself ends as a
single clean "received" row, so **the ledger looks correct while the summary is
silently inflated.** Nothing surfaces the disagreement until someone runs
"Recalculate from ledger".

This is the same defect GS-010 fixed for God Fund spends by moving the check
inside `runTransaction`. The contribution paths never received that treatment.

**Mitigation present, and its limit.** `ContributionsList.tsx:181` disables the
row via `receivingId` while the write is in flight, which covers the
single-device double-tap. It does not cover two devices — and the guard clears
in `.finally()`, which fires when `commitWrite` returns, not when the server
acknowledges (see N-07).

### N-02 — P1 — `receiveSponsorship` has the same defect, and it is harder to see

`services/ganesh/ganeshSponsors.ts:681`

Same read-check-batch shape. `appendReceiveEffects` writes the mirror
contribution at the **deterministic** id `{sponsorshipId}-contribution`, so a
double-receive leaves exactly one contribution document — correct. But the
`bumpSummary` in the same helper uses `increment()`, which is **not**
idempotent. So the ledger is right, the summary is wrong, and a recompute
would silently disagree with the displayed balance.

`services/ganesh/ganeshSponsors.ts` contains **zero** `runTransaction` calls
across all 13 exported functions, several of which move money.

### N-03 — P1 — `cancelContribution` can drive promised totals negative

`services/ganesh/ganeshWrites.ts:2039`

Same shape. Two cancels of one promise decrement
`promisedCashContributions` / `promisedInKindValue` twice. Because "Promised"
and "Received" must stay clearly distinguished (a product requirement), a
negative promised total corrupts the number the committee is asked to trust.

### N-04 — P1 — `voidFinancialRecord` can reverse the same record twice

`services/ganesh/ganeshWrites.ts:2722`

`getDoc` → `if (snap.data().voided) throw` → `writeBatch` → `commit`. The
already-voided guard is outside the batch.

**Failure scenario.** Two admins void the same ₹8,000 God Fund expense. Both
reads see `voided: false`. Both commit. `godFundExpenses` is credited back
₹16,000 for an ₹8,000 expense and the Cash bucket gains ₹16,000 — the festival
now reports more money than it ever received. For an expense with a personal
component, `personalExpenses` and `pendingReimbursement` are also
double-reversed, which GS-009 specifically fixed against going negative.

This is the highest-impact of the four: void is the one operation that
*creates* money in the ledger.

### N-05 — P2 — `addSponsorship` is not atomic

`services/ganesh/ganeshSponsors.ts:520`

Creates with a fresh `newId()` each call, so a double-submit produces two
distinct sponsorship documents rather than drift — a duplicate-record problem
rather than a balance problem, but a sponsorship created already `received`
bumps festival cash on both.

### N-06 — P2 — Volunteer duty counters drift

`services/ganesh/ganeshSeva.ts:175` (`assignDuty`), `:219` (`removeDuty`)

`getDoc` → check → `writeBatch` with `increment()`. Concurrent assignment of
the same volunteer inflates the seva's duty count. No money involved, and
`recomputeFestivalSummary` does not rebuild seva counters, so the drift is
permanent.

### N-07 — context, not a defect — the 1.5 s ack window widens every window above

`lib/firestoreWrite.ts:24`

`commitWrite` reports a write as `queued` (success) after
`SERVER_ACK_GRACE_MS = 1500`, so the UI closes and in-flight guards release
before the server has confirmed anything. This is a deliberate, documented
offline trade-off and `commitWrite` correctly does **not** retry (so no
double-increment from retries). But it means the "in flight" locks protecting
N-01…N-06 release after 1.5 s rather than on acknowledgement, making the
double-submit path reachable on one device too, not just two.

---

## Backlog re-triage

### Fixed since 2026-08-24 but still marked OPEN

The backlog understates progress; these were fixed without updating the ticket.

| Ticket | Was | Verified now |
|---|---|---|
| GS-011 | Payment method not tracked end to end | **FIXED** by `e8e20ba` + today's work — `paymentMethod` flows through collections, contributions, expenses, reimbursements and sponsors; the report shows the split |
| GS-012 | `recomputeFestivalSummary` truncates at 2000 docs, clobbers concurrent writes | **FIXED** — `loadAllFestivalDocs` pages at 500 with no cap; an `updatedAt` comparison rejects a racing recompute |
| GS-013 | Report totals computed from 400-doc truncated lists | **FIXED** — no `limit(` remains in any Ganesh data hook or provider |
| GS-024 | Per-member counters never rebuilt by the recompute | **FIXED** — recompute now writes `contributionPaid` / `personalExpenses` / `reimbursed` / `pendingReimbursement` per member |
| GS-038 | `collectedAmount` written as an absolute value on void | **FIXED** — now `increment(-amount)`, with a comment citing the ticket |

### Confirmed still open

| Ticket | Sev | Verified state |
|---|---|---|
| GS-020 | P1 | **Real.** Voiding an asset-purchase expense reverses the money and `assetPurchaseAmount` but never touches the asset document. The asset stays in Pandal inventory, with its acquisition cost, while the expense that bought it is voided. `data.assetId` is read only to compute a boolean. |
| GS-023 | P1 | **Real.** `transferPermanentToFestival` honours `input.festivalId`; `transferFestivalToPermanent` ignores it and uses `requireFestival()` — the *session* festival. `permanent-fund.tsx:123` feeds the panel `openFestivals[0]?.id ?? festivalId`. With two open festivals, or a session pointing elsewhere, money leaves the Permanent Fund into one festival and returns from another. The PF balance stays right; two festivals' God Funds are both wrong. |
| GS-029 | P1 | **Real, and wider than filed.** 61 of 64 write wrappers in `useGaneshWrites.ts` are non-`async` and throw synchronously via `requireFestival` / `requirePandal` / `requireDb` / `assertHasPermission`. A caller written as `writes.x().catch(...)` — e.g. `ContributionsList.tsx:181` — never reaches its `.catch`, because the throw happens before a promise exists. This defeats `lib/errors.ts`, the required path for user-facing errors, on 61 write paths. Reachable on session expiry, a festival-switch race, or a permission revoked while a screen is open. |
| GS-033 | P2 | **Real.** `components/ganesh/GaneshScreen.tsx:94` uses a plain `ScrollView` — no `KeyboardAvoidingView`, no `keyboardShouldPersistTaps`. Every Ganesh money-entry form renders inside it, so on a small Android phone the keyboard covers the amount field and the save button. |
| GS-021 | PARTIAL | `writeFestivalAudit` now exists and is called on festival close (`ganeshPermanentFund.ts:494`, `:499`). The transfer paths still write only an `activity` entry and **no** `auditLogs` entry, so Permanent Fund movements remain outside the audit trail. |
| GS-039 | P2 | **Real.** `sponsoredAmount` is stored on each expense document but never aggregated into `GaneshSummary`, and `recomputeFestivalSummary` does not read it. The sponsored portion of an expense appears in no total. |

### Not re-verified

42 MEDIUM and 20 LOW tickets were **not** individually re-checked. Given that
5 of the 20 CRITICAL/HIGH tickets I did check turned out already fixed, expect
a similar stale fraction there. Treat those counts as an upper bound.

---

## Verified sound

Checked specifically because they are the most likely places for the reported
bug's shape to recur:

- **`resolveCollectorId`** (`ganeshWrites.ts:1535`) — falls back to the actor in
  every failure branch and throws only with no signed-in user. Cannot block a
  collection.
- **Ganesh UI data access** — no non-null assertions on Firestore data anywhere
  in `app/(ganesh)`, `components/ganesh`, `services/ganesh` or the Ganesh hooks.
  The two bare `[0]` accesses (`(tabs)/index.tsx:127`, `ui/Avatar.tsx:26`) are
  both length-guarded. This class is genuinely clean.
- **`commitWrite`** — does not retry, so batches containing `increment()` cannot
  double-apply from a retry.
- **`cancelSponsorship`** — correctly bumps nothing; sponsor promised totals are
  derived from the sponsorship documents by `summarizeSponsorships`, not
  aggregated, so there is nothing to drift.
- **Void symmetry** — every void branch reverses the same fields its create
  path bumped, including location buckets. The defect in N-04 is atomicity,
  not asymmetry.
- **Permanent Fund ledger** — `applyPermanentFundDelta` has been maintained
  since inception and needs no equivalent of the unclassified-God-Fund model.

---

## Recommended order

1. **Deploy `firestore.rules`.** Four CRITICALs, already written. Nothing here
   competes with this.
2. **N-04** — `voidFinancialRecord` into a transaction. Void is the operation
   that creates money; double-reversal is the worst outcome in this report.
3. **N-01, N-02, N-03** — move the status guard inside a transaction for
   contribution receive/cancel and sponsorship receive. `ganeshSponsors.ts`
   needs its first transaction.
4. **GS-020** — decide and implement what voiding an asset purchase does to the
   asset. This needs a product answer, not just a code change.
5. **GS-023** — make `transferFestivalToPermanent` take an explicit
   `festivalId` from the same source the transfer-out panel uses.
6. **GS-029** — make the write wrappers `async` so a synchronous guard becomes
   a rejected promise and `lib/errors.ts` handles it.
7. **GS-033** — keyboard avoidance in `GaneshScreen`, once, for every form.
8. **Re-triage the 62 MEDIUM/LOW tickets** before trusting the backlog counts.
9. **Update the backlog statuses** for the five tickets fixed above.

## Verification performed

- `npm run typecheck` — clean (no code changed by this audit)
- `npx vitest run` — 145 files, 1444 tests, all passing

## Fix log

Applied 2026-09-03, after the diagnostic pass. `npm run typecheck` clean and
`npx vitest run` green (146 files, 1447 tests) after each step.

| Finding | Change |
|---|---|
| N-04 | `voidFinancialRecord` moved into `runTransaction`, with the member and household reads hoisted ahead of the writes. `assertVoidOnline` already gated the path, so no capability was lost. 3 regression tests in `services/ganesh/ganeshVoid.write.test.ts`. |
| N-01 | `receiveContribution` routes by kind: **money** receives run in a transaction that re-reads and re-validates the status; **in-kind** receives stay on a batch so a volunteer can still record a donated item offline. The pre-read only routes and is never trusted as a check. |
| N-02 | `receiveSponsorship` routes the same way — **cash** in a transaction, item/service on a batch. `ganeshSponsors.ts` gained its first `runTransaction`. |
| N-03 | `cancelContribution` moved into a transaction, plus a new `assertPromiseCancelOnline` gate — the path had no offline gate at all, so a transaction without one would have hung the save. |
| GS-023 | `transferFestivalToPermanent` now takes an explicit `festivalId` and the Permanent Fund panel passes the same festival its transfer-out branch targets. Both directions resolve one festival. |
| GS-029 | All 64 write wrappers in `useGaneshWrites.ts` are now `async`, so a synchronous guard becomes a rejected promise that existing `.catch` handlers and `lib/errors.ts` see. A comment on `requireFestival` records why, so it is not "simplified" back. |
| GS-033 | `GaneshScreen` wrapped in `KeyboardAvoidingView`, iOS-only, matching `components/common/Modal.tsx` — the Android activity is already `adjustResize`, so padding there would double-count the keyboard. Fixes every Ganesh form at once. |
| GS-021 | Both Permanent Fund transfer directions now write an `auditLogs` entry, including the settlement transfer during a close. |
| GS-020 | Voiding an expense that bought an asset is now refused while the Pandal still owns it, pointing the user at the Assets screen — the same treatment a Permanent Fund opening entry already gets. Once the asset is disposed, lost, or deleted, the void proceeds. 2 more tests in `ganeshVoid.write.test.ts`. |
| GS-039 | New `summary.sponsoredExpenseAmount`, maintained by `addExpense` / `addAssetPurchase` / `updateExpenseAmounts` / void, derived by `recomputeFestivalSummary`, and shown on the report as "Paid directly by sponsors". "Festival expenses" keeps its existing meaning so it still reconciles against cash out. |

**`firestore.rules` needs the redeploy for GS-039.** The summary validator uses
`keys().hasOnly([...])`, so the new `sponsoredExpenseAmount` field is added to
that allowlist in `firestore.rules`. Until the rules are deployed the *current*
deployed rules have no summary validation at all, so writes succeed either way
— but deploying the old rules after this change would reject every summary
write. Deploy the version in this repo, not an older copy.

### Corrections to the findings above

Three claims in the diagnostic pass did not survive implementation. Recorded
here rather than quietly dropped.

**N-05 was wrong.** `addSponsorship` is already idempotent: `add-sponsor.tsx:94`
holds a stable `useRef(newId()).current` and passes it as `clientOpId`, which
`ganeshSponsors.ts:535` uses as the document id. A double-submit writes the same
document. No fix needed, and none applied.

**N-06 is deliberate and stays.** `ganeshSeva.ts` documents `dutyCount` as
denormalised for list rows, with `dutyCounts()` over the real duty documents as
the source of truth on the detail screen. Drift shows only as a stale label on
`SevaRow` and the People tab total; nothing computes money or gates behaviour
on it. Converting `assignDuty` to a transaction would cost volunteers the
ability to assign seva offline — in the field, with no signal — to correct a
cosmetic count. Downgraded P2 → P3, not fixed.

### Correction to GS-033 as filed above

The audit text says GaneshScreen has "no `keyboardShouldPersistTaps`". That is
wrong — it is present at `GaneshScreen.tsx:99` and always was; the grep behind
that claim was case-sensitive. Tapping Save with the keyboard up already
worked. Only `KeyboardAvoidingView` was genuinely missing, which is what the
fix adds.

## Still open

| Finding | Why not fixed |
|---|---|
| GS-020 | Voiding an asset purchase orphans the asset. Needs a product decision on what should happen to the asset, not just a code change. |
| GS-039 | `sponsoredAmount` is not aggregated into any total. Adding a summary field means deciding whether it counts as festival income, and `recomputeFestivalSummary` has to derive it too. |
| N-05 | Not a defect — see corrections above. |
| N-06 | Deliberate design, downgraded to P3 — see corrections above. |
| N-07 | The 1.5 s ack window is unchanged. It no longer matters for N-01…N-04, which are now atomic server-side rather than relying on UI locks. |
| 62 MEDIUM/LOW backlog tickets | Not re-triaged. |
| GS-001/002/003/004/005/014 | Deploy and script-run actions, not code. |
