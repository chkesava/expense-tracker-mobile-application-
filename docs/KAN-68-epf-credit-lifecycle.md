# KAN-68 — EPF: Contribution Credit Lifecycle & Current-Employment UI

| | |
|---|---|
| **Jira** | [KAN-68](https://kesavach.atlassian.net/browse/KAN-68) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-68-epf-credit-lifecycle` |
| **Date** | 2026-09-11 |
| **Builds on** | [KAN-65](./KAN-65-epf-data-model.md), [KAN-66](./KAN-66-epf-historical-contributions.md), [KAN-67](./KAN-67-epf-contribution-cron.md) |

## Why

KAN-67 generates a month as `expected` and stops. Every other status the epic
asks for — `credited`, `partial`, `missed`, `reversed` — was **declared in the
types but never written**. A projected balance that never advances past
"expected" is not much of a simulation.

## Scope — most of this ticket was already shipped

Roughly 60% of KAN-68's description restates KAN-67. Those requirements are
satisfied and tested; they were **closed against, not rebuilt**:

| KAN-68 requirement | Delivered by |
|---|---|
| Exactly one active establishment | `selectEstablishmentForMonth` |
| Generate the monthly record | `planScheduledContributions` |
| Contribution month ≠ expected credit date | `expectedCreditFrom`/`To` |
| Configurable credit window | `data/epfCreditWindow.ts` |
| Stop after the final working month | `monthsToGenerate` |
| Next establishment starts at its joining month | `selectEstablishmentForMonth` |
| A ends Aug / B starts Sep | `schedule.test.ts` |
| Historical never in the scheduler queue | `isEligibleForAutomatedProcessing` |
| Idempotent scheduled writes | deterministic id + `batch.create` + protected sources |

**This ticket delivered:** the transitions, recording actual credit, the audit
trail, and the current-employment UI.

## The honesty problem

Spendly cannot see anyone's EPFO account. Auto-advancing a month to `credited`
asserts something the app does not know, so the difference between *projected*
and *confirmed* is carried **in the data**, not only in the UI:

- `source: "simulated"` marks provenance (KAN-67).
- **`reconciledAt`** is set only when a *person* confirmed the month. Its absence
  is what makes a projection visibly a projection, and lets KAN-70 find every
  unconfirmed row with one query.

`contributionStatusMeta` renders "Credited · projected" without it and
"Credited" with it, so **no component branches on status** — the rule from
KAN-66 holds.

## Transitions

```
expected ──(window passed, cron or catch-up)──► credited   [projected]
credited ──(user records actual = expected)───► credited   [reconciledAt set]
credited ──(user records actual < expected)───► partial
   any   ──(user marks)──────────────────────► missed
credited ──(user marks)──────────────────────► reversed
```

**Only the first arrow is automatic.** `missed` and `reversed` are always
user-asserted: the app cannot observe either, and a wrong guess writes a false
negative into someone's financial history.

Design details worth keeping:

- An **over-credit stays `credited`**, not an error state — arrears and
  corrections are normal.
- A shortfall makes the month `partial` and **preserves `epfCredit`**, so the
  projection and the actual sit side by side rather than one overwriting the
  other.
- `canTransition` refuses illegal moves: a `draft` cannot jump into the
  lifecycle (KAN-66 owns that path), and nothing reverses straight from
  `expected` because nothing was credited yet.

## Audit trail

`users/{uid}/epfContributionEvents/{autoId}` — a flat sibling collection,
following the convention KAN-65 established.

```jsonc
{ "contributionId": "est-1_2026-08", "establishmentId": "est-1",
  "month": "2026-08", "from": "expected", "to": "credited",
  "amount": 4750, "actor": "system" | "user", "reason": "…", "at": <ts> }
```

Append-only, and written **in the same batch as the status change**, so a row
and the event describing it can never diverge. An array on the contribution row
was rejected: Firestore rewrites arrays wholesale, so a concurrent write can
drop entries — precisely the data loss an audit trail exists to prevent.

## Files

| File | Role |
|---|---|
| `shared/features/epf/utils/lifecycle.ts` | All transition logic |
| `shared/features/epf/utils/contributions.ts` | `contributionStatusMeta` gains `reconciled` |
| `shared/features/epf/schemas/index.ts` | `epfCreditFormSchema` |
| `hooks/useEpfContributions.ts` | `recordCredit`, `markMissed`, `markReversed`, `autoAdvanceCredits` |
| `hooks/useEpfCatchUp.ts` | Advances credits on app open |
| `netlify/functions/epf-cron.ts` | Advances credits during the monthly run |
| `components/epf/EpfCurrentMonthCard.tsx` | "This month" on the EPF tab |
| `components/epf/EpfCurrentContributions.tsx` | `Current` tab |
| `components/epf/EpfCreditSheet.tsx` | Record credit / mark missed / reverse |

The route now opens on **Current** for a live employment and hides that tab for
a closed one.

## Warning state

An explicit ticket requirement. When there is no current employment, or no wage
to project from, the card says so and links to the fix rather than showing a
projection built on nothing — `projectionBlocker` decides, and it is tested.

## Rules and indexes

- `firestore.rules` — inventory comment only. **No rule logic change**; the
  recursive owner grant covers the new collection, which is also the ticket's
  "backend authorization prevents cross-user access".
- `firestore.indexes.json` — **no change.** Events are read by equality on
  `contributionId`. Note the file is a superset of live after KAN-78 — keep it
  that way.

## Tests

| File | Count |
|---|---|
| `shared/features/epf/utils/lifecycle.test.ts` | 33 |
| `firestore/personalData.rules.test.ts` | +2 |

Full suite: **2087 unit**, **166 rules**, both typechecks clean. Both Netlify
bundles verified to load under the CJS runtime (the KAN-36 `jose` trap).

## Known limitations

1. **A reversed month is ambiguous for the balance.** This ticket records the
   state; whether a reversal subtracts or excludes is KAN-70's arithmetic to
   decide. Flagged rather than assumed.
2. **Auto-crediting still asserts what the app cannot see.** Mitigated by
   `reconciledAt` and the "projected" label, but anyone who never reconciles
   carries a projected balance. KAN-70 is where that is corrected.
3. **Not verified on device.** Automated tests and typechecks only.

## Manual testing guide

1. With a current employment and a recorded wage, open EPF → **This month** card
   shows the month as **Expected** with its credit window.
2. Remove the wage → the card shows the warning, not a projection.
3. For a month whose window has passed, reopen → **Credited · projected**.
4. Open it → **Record credit** with the expected amount → **Credited**, no
   "projected" suffix.
5. Record a lower amount on another month → **Partial**, and the original
   projection is still visible.
6. **Mark as missed**, then **Mark as reversed** on a credited month → both
   confirm first.
7. Reopen → statuses persist; reopening again advances nothing further.
8. Repeat on Web.
