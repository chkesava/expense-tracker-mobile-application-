# Ganesh Seva — God Fund location audit (2026-09-03)

Triggered by a live report: adding a ₹222 Flowers expense from the God Fund was
rejected with "Insufficient Cash in the God Fund. Available: ₹0. Requested:
₹222." while the Pandal Transparency report showed ₹46,911 total money in.

Branch state at audit: `main` @ `156383a`.

---

## Root cause

The God Fund is tracked twice on the festival summary document:

| Quantity | Source | Location-aware |
|---|---|---|
| Available God Fund | `availableGodFund()` — `shared/utils/ganeshMath.ts` | No |
| Cash / UPI / Bank / Other buckets | `summary.cash/upi/bank/other` | Yes |

`validateGodFundLocationSpend()` checked the total (passed), then checked the
selected bucket (failed at ₹0).

The buckets were introduced in commit `e8e20ba` ("track festival Cash/UPI/Bank
and drive Funds from one overview"). Every write path added since maintains
them correctly:

| Path | Location bump |
|---|---|
| Collections | `ganeshWrites.ts:1422`, `:1516` |
| Contributions | `ganeshWrites.ts:1765`, `:1944` |
| Sponsor cash | `ganeshSponsors.ts:279` |
| Permanent Fund transfers | `ganeshPermanentFund.ts:365`, `:460` |
| Expenses / assets / reimbursements | `ganeshWrites.ts:2210`, `:2393`, `:2695` |

**No backfill was ever written for festivals that already held money.** There
is a `scripts/backfill-ganesh-admin-count.js`; there was no equivalent for the
location buckets. Any festival funded before `e8e20ba` therefore has a correct
total and four empty buckets, and every Cash/UPI/Bank spend on it is refused.

`repairFestivalLocations()` then concealed the fault: it absorbs the entire
unclassified remainder into `other`, so totals reconcile perfectly and nothing
looks wrong.

---

## Findings

### GF-01 — P0 — No backfill for the location buckets (root cause)
Festivals funded before `e8e20ba` cannot spend the God Fund from any location.
**Fixed** — see "Unclassified God Fund" below.

### GF-02 — P0 — `recomputeFestivalSummary` reset the receipt counter
`recomputeFestivalSummary` writes with `txn.set` (full document replace) and
`summarizeLedger` spreads `EMPTY_GANESH_SUMMARY`. It restored
`nextContributionNumber` but not `nextReceiptNumber`, so the documented repair
path reset collection receipt numbering to 0 — re-issuing receipt numbers
already handed to donors. This made the only available workaround unsafe.
**Fixed** — `ganeshWrites.ts`, both counters now preserved.

### GF-03 — P1 — The desync signal was computed and discarded
`locationInvariantHolds` was built in `ganeshFinancialOverview.ts` and rendered
in zero components. Worse, it treated "every bucket zero" as healthy — the
exact broken state was whitelisted as fine.
**Fixed** — whitelist removed; `unclassifiedGodFund` added to the overview and
surfaced on the report.

### GF-04 — P1 — "Paid from" showed no balances, defaulted to Cash
`add-expense.tsx` defaults `paymentMethod` to `"cash"` and the chips carried no
figures, so the first spend on any affected festival hit the wall with no way
to see why.
**Fixed** — chips show per-location spendable; empty locations are disabled
while some location has money.

### GF-05 — P2 — Overdrawn buckets displayed as negative
`repairFestivalLocations` only ever patched `other` and bailed when `other`
would go negative, so a negative bucket rendered as "Cash −₹222".
**Fixed** — overdrawn buckets read as empty, `other` carries the difference.

### GF-06 — P3 — `sourceType` fed to a location resolver
`resolveFundLocation(input.location ?? input.sourceType)` at
`ganeshWrites.ts:1186`, and the same fallback at `:2796` and in the recompute
opening-funds loop. `sourceType` is a provenance (`permanent_fund`,
`donation`), never a location, so the fallback only ever produced `"other"`.
Harmless in effect, misleading in intent.
**Fixed** — fallback removed in all three places.

### GF-07 — P2 — "Cash" meant two things on the report
"Total cash in" meant money received; "Cash" four tiles later meant the Cash
bucket. This is what made the screens read as contradictory.
**Fixed** — renamed to "Total money in" / "Money that entered this festival".

---

## The fix: unclassified God Fund

Rather than requiring every Pandal to find and press "Recalculate from ledger",
money whose location was never recorded is now a first-class quantity.

```
unclassified   = max(0, availableGodFund - (cash + upi + bank + other))
spendable(loc) = min(availableGodFund, bucket(loc) + unclassified)
```

Both ceilings apply, so nothing can be overspent. Properties:

- A pre-`e8e20ba` festival spends normally from any location, with no
  intervention by anyone.
- Spending unclassified money as Cash drives the cash bucket negative. That is
  the honest record of the draw, `unclassified` is unchanged by it, and later
  spends are unaffected.
- Once every rupee is classified, `unclassified` is 0 and the per-location
  ceilings bite exactly as originally written. The existing overdraft test
  (`refuses to overspend a location even when total God Fund is enough`) still
  passes unmodified.
- "Recalculate from ledger" remains the way to convert unclassified money into
  a real split, and is now safe to run. Collection documents have carried
  `paymentMethod` since `ca26c92`, and openingFunds/fundTransfers have carried
  `location` since `8646d80`, so the ledger has everything needed to rebuild
  the split accurately.

---

## Verified sound (no change needed)

- Contributions, sponsor→contribution mirroring (`ganeshSponsors.ts:246`, so a
  recompute does not lose sponsor cash), household carry-forward.
- All void paths bump locations symmetrically with their create paths.
- `loadAllFestivalDocs` paginates at 500/page with no cap — the GS-012
  truncation is no longer live.
- Permanent Fund is a separate, always-maintained ledger
  (`applyPermanentFundDelta`) and was not touched.

## Files changed

| File | Change |
|---|---|
| `shared/utils/ganeshMath.ts` | `GodFundLedger`, `unclassifiedGodFund`, `godFundSpendableAt`; rewrote `validateGodFundLocationSpend`; overdraft-safe `repairFestivalLocations` |
| `shared/utils/ganeshFinancialOverview.ts` | Removed the all-zero whitelist; exposed `unclassifiedGodFund` |
| `services/ganesh/ganeshWrites.ts` | Preserve `nextReceiptNumber`; dropped `sourceType` location fallback (3 sites) |
| `app/(ganesh)/add-expense.tsx` | Per-location balances on "Paid from"; disable empty locations; explain unclassified money |
| `app/(ganesh)/report.tsx` | "Total money in"; surface unclassified God Fund |
| `shared/utils/ganeshMath.test.ts` | 5 tests covering the reported failure and the classified-festival ceiling |

## Verification

- `npm run typecheck` — clean
- `npx vitest run` — 145 files, 1444 tests, all passing

## Not done

- No automated conversion of unclassified money into a real Cash/UPI/Bank
  split. Spending is unblocked without it; classifying history is an admin
  decision and remains behind "Recalculate from ledger" on the report.
- `recomputeFestivalSummary` still does not recompute households or per-member
  counters beyond contribution/reimbursement totals (pre-existing, tracked in
  `ganesh seva future ideas/GANESH_SEVA_AUDIT_TICKETS.md`).
