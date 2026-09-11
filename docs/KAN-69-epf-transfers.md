# KAN-69 — EPF: Transfer Between Establishments & Transfer Reconciliation

| | |
|---|---|
| **Jira** | [KAN-69](https://kesavach.atlassian.net/browse/KAN-69) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-69-epf-transfers` |
| **Date** | 2026-09-12 |
| **Builds on** | [KAN-65](./KAN-65-epf-data-model.md) · [KAN-66](./KAN-66-epf-historical-contributions.md) · [KAN-67](./KAN-67-epf-contribution-cron.md) · [KAN-68](./KAN-68-epf-credit-lifecycle.md) |

## Why

When someone changes jobs their EPF balance follows them. Until now a balance
sat permanently wherever it was earned, so three past employers meant three
stranded pots rather than one fund.

KAN-69 makes that movement representable: a traceable transfer that shifts
balance between establishments **without touching a single monthly contribution
record** — the ticket's central requirement.

## Decisions

| Decision | Outcome |
|---|---|
| Where transfers live | Separate `epfTransfers` collection. Contribution ids are `{establishmentId}_{YYYY-MM}` — month-keyed — and a transfer is not monthly |
| What a transfer is | A **simulated move inside Spendly**, reconcilable to a real EPFO transfer |
| Balance | `establishmentBalance()` built here as shared pure logic |
| States | `initiated` → `completed` / `failed`, with reversal as a compensating row |

### "Simulated" and the epic's product principle

The epic forbids implying Spendly moved money at EPFO. A simulated transfer is
compatible with that **provided it is labelled**, which this ticket also demands
("clearly distinguish simulated/manual transfer from an actual reconciled
transfer").

So transfers carry **`reconciledAt`**, exactly as KAN-68 does for credits: set
only when a person confirms against a real EPFO transfer. A completed but
unconfirmed transfer reads "Completed · simulated"; a confirmed one reads
"Completed". The form says so too: *"Recorded in Spendly only. File the actual
transfer with EPFO, then confirm it here once it lands."*

## Architecture

### One document, two ledger legs

The ticket asks for "transfer-out from source and transfer-in to destination as
separate linked ledger events". **One document naming both establishments
delivers that more safely than two rows.** The legs derive from a single atomic
record, so they cannot desync. Two documents can — one write lands, the other
fails, and the ledger is permanently unbalanced with no way to tell which side
is right.

`establishmentBalance()` reads the same document as `−amount` for the source and
`+amount` for the destination. Separate *in the ledger view*, which is what the
requirement is for; inseparable *in storage*, which is what correctness needs.

### Balance — the one definition

```
balance(est) =
    Σ credited / partial / confirmed contributions   (creditedAmount ?? epfCredit)
  + Σ completed transfers where destination = est
  − Σ completed transfers where source     = est
```

Only `completed` transfers move balance: `initiated` has not settled, `failed`
never will.

**KAN-70 and KAN-71 must consume `establishmentBalance` rather than re-deriving
it**, or three tickets end up with three subtly different numbers.
`transferableBalance` is the same figure floored at zero — what validation
compares against.

### Reversal — stored intent, derived presentation

The ticket requires compensating events rather than deletion. Reversing **T**:

1. Creates a new `completed` transfer **R** in the opposite direction with
   `reversalOf: T.id`.
2. Sets `reversedBy: R.id` on T. **T keeps `completed`** — it did happen, and the
   ledger says so.

Balance sums every `completed` transfer, so T and R net to zero with **no
special-casing in the balance function at all**. "Reversed" is a derived display
state (`reversedBy` is set), never a stored status — which is why
`EpfTransferStatus` has three values while the UI shows four. The same
stored-intent / derived-presentation split KAN-65 used for employment and KAN-68
for reconciliation.

Both halves are written in **one batch**, so a reversal cannot half-apply.

### Idempotency

Completion runs inside `runTransaction`, re-reading the document and aborting
unless it is still `initiated`. A replayed or double-tapped completion is
refused rather than applying the amount twice. (Client transactions *can* `get` a
document — the KAN-65 constraint was only about reading **queries**.)

## Validation

`validateTransfer` returns issues and never throws, so the form reports every
problem at once:

- **No self-transfer.**
- Both establishments must exist under this user — which is what keeps a
  transfer inside one UAN.
- Amount > 0.
- Amount ≤ transferable balance **unless an adjustment reason is given**. Real
  EPFO statements disagree with a simulation often enough that a hard block
  would strand users with no way to record what actually happened.
- Date valid and not in the future.

## Files

| File | Role |
|---|---|
| `shared/features/epf/utils/transfers.ts` | Balance, validation, guards, reversal |
| `shared/features/epf/schemas/index.ts` | `epfTransferFormSchema` |
| `hooks/useEpfTransfers.ts` | Listener + create/complete/fail/reverse/reconcile |
| `components/epf/EpfTransfersList.tsx` | Transfers tab with balance header |
| `components/epf/EpfTransferFormModal.tsx` | Pickers, live source→destination summary |
| `components/epf/EpfTransferDetailModal.tsx` | Actions, each confirmed via `appDialog` |

The establishment route now has four tabs: Current · History · Backfill ·
Transfers.

The listener is **unfiltered** — a person makes a handful of transfers in a
working lifetime, and balance needs all of them regardless of which
establishment is on screen. No filter means no index and no deploy dependency.

## Rules and indexes

- `firestore.rules` — inventory comment only. **No rule logic change**; the
  recursive owner grant covers both new collections, which is the ticket's
  server-side authorization requirement.
- `firestore.indexes.json` — **no change.** Keep the file a superset of live
  (KAN-78).

## Tests

| File | Count |
|---|---|
| `shared/features/epf/utils/transfers.test.ts` | 35 |
| `firestore/personalData.rules.test.ts` | +4 |

Full suite: **2122 unit**, **170 rules**, both typechecks clean.

The test that matters most is **"nets a reversed pair back to zero movement"** —
getting reversal wrong would silently double or zero a balance, and nothing else
would catch it.

## Known limitations

1. **Balance now has one definition and three tickets depend on it.** That is
   the point, but KAN-70 and KAN-71 must consume `establishmentBalance` rather
   than writing their own.
2. **KAN-68 left "does a reversed *month* subtract or get excluded?" open.** This
   ticket answers the transfer half only; the contribution half is still KAN-70's.
   Note `establishmentBalance` currently **excludes** `reversed` contributions —
   KAN-70 should confirm that is the intended arithmetic.
3. **Simulated transfers move projected balances.** Someone who never reconciles
   sees a tidy but unverified picture; `reconciledAt` is the hook KAN-70 uses.
4. **Not verified on device.** Automated tests and typechecks only.

## Manual testing guide

1. With two establishments where the previous one has credited months, open it →
   **Transfers** → **Record a transfer**.
2. Try the same employer as source and destination → rejected. Try a negative
   amount → rejected. Try more than the balance → rejected until a reason is
   given, then accepted as an adjustment.
3. Record it → shows **Initiated**; **balances are unchanged**.
4. Open it → **Complete transfer** → confirm → source balance falls and
   destination rises by the same amount. Check History: **every monthly row is
   untouched**.
5. From a stale screen, complete again → refused, not double-applied.
6. **Reverse** it → a compensating transfer appears, the original shows
   **Reversed**, and both balances return to their starting values.
7. **Confirm against EPFO** on a completed transfer → the "simulated" marker
   disappears.
8. Repeat on Web.
