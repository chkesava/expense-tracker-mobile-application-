# SPENDLY-362 — Financial Decision domain model, lifecycle and provenance

**Ticket:** [SPENDLY-362](https://kesavach.atlassian.net/browse/SPENDLY-362) (Story)
**Epic:** [SPENDLY-361](https://kesavach.atlassian.net/browse/SPENDLY-361) — see [epic record](SPENDLY-361-financial-decision-journal.md)
**Branch:** `feature/SPENDLY-362-decision-domain-model`, cut from the epic branch.
**Scope:** types, pure rules and Firestore rules. No UI, and no writes from the app yet.

---

## 1. Design

### 1.1 Reasoning, not money
A `MoneyDecision` holds no authoritative amounts. The rules' `hasOnly` allowlist leaves out any top-level `amount`, `date` or `balance`, so no spending or balance figure can ever be read from a decision.

Linked records (`links[]`) are `{kind, refId, refKind?}` references. The `capturedLabel` and `capturedAmount` on a link record what it looked like when it was linked. They are display-only history and are never summed.

### 1.2 Separate fields for separate kinds of content
| Kind | Field |
|---|---|
| Facts | `links` (references to canonical records) |
| Assumptions | `assumptions[]`, each with `source`: `user`, `linked` (needs `sourceLinkId`) or `derived` (needs `derivation`) |
| User inputs | `alternatives[].inputs[]`, always `kind: "user_input"` and never negative |
| Rationale / opinion | `rationale`, `context`, alternative `notes` / `pros` / `cons` / `nonFinancial`, `confidence` |
| Expected outcome | `expected` |
| Actual outcome | `outcome`. Only what the user recorded; `userAssessment` is the user's own verdict |

`validateDecision` enforces the provenance: a linked assumption must point at an existing link, and a derived one must say how it was derived.

### 1.3 Lifecycle
The lifecycle is: draft → considering → decided → tracking → reviewed → closed.
* `considering` can go back to `draft`. `reviewed` can reopen to `tracking`, and `closed` can reopen to `reviewed`.
* `archived` can be reached from any state, and restoring returns to `archivedFromStatus`.
* A decision can reach `decided` only once the chosen option exists. A plain yes/no decision with no listed options may be decided without one.
* Moving to `closed` stamps `closedAtMs`. Reopening clears it.

### 1.4 Frozen snapshot
The first move into `decided` (or any later status) copies the alternatives, selection, assumptions, expected outcome, links and rationale into `decisionSnapshot`, and sets `decidedAtMs`. It is **never re-frozen**. Three layers protect it:
* `transitionDecision` freezes the snapshot only when none exists yet;
* `buildDecisionWrite` always carries forward the previous snapshot and `decidedAtMs`;
* the rules refuse any update that changes an existing `decisionSnapshot`.

### 1.5 Audit
Every write produces one append-only `decisionEvents` row: `{decisionId, action, fromStatus?, toStatus?, changedFields[], revision, atMs}`. It holds **field names only, never content**, so private notes can't leak through the audit trail. It mirrors `ledgerEvents`: the owner can read and create, and update and delete are denied.

### 1.6 Security
Both collections are:
* owner and duress-twin only;
* limited to an allowlist of fields;
* restricted to closed enums (category, status, event action);
* size-capped: title 140, text 2000, 20 alternatives, 30 assumptions, links and commitments, 20 list items, 40 changed fields.

The `revision` must advance on every write, and `createdAtMs` is pinned.

### 1.7 Migration and seed
None are needed. Nothing is backfilled, and nothing writes to ledger collections.

## 2. Files

| File | What |
|---|---|
| `shared/types/decision.ts` | Types, enums, limits |
| `shared/utils/decisionModel.ts` (+test, 23) | Lifecycle, snapshot freezing, validation, provenance, write builder, audit events, labels |
| `shared/utils/decisionModel.rules.contract.test.ts` (4) | Rules enums and caps match TS; every written field is in the allowlist |
| `firestore.rules` | `decisionWellFormed` + `match /decisions`, `decisionEventWellFormed` + `match /decisionEvents` |
| `firestore/decisions.rules.test.ts` (10) | Emulator: ownership, duress, cross-user denial, shape, money-field refusal, caps, snapshot pinning, revision, append-only events |

## 3. Validation

* `npm test`: 292 files / 4616 tests.
* `npm run test:rules`: 16 files / 475 tests.
* `typecheck` and `typecheck:shared`: clean.
* **Deploy note:** these are new rules blocks, so they need the normal manual rules deploy when the epic ships.
