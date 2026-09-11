# KAN-65 — EPF: Data Model, UAN Profile & Establishments

| | |
|---|---|
| **Jira** | [KAN-65](https://kesavach.atlassian.net/browse/KAN-65) (epic [KAN-64](https://kesavach.atlassian.net/browse/KAN-64)) |
| **Product** | Spendly → Investments → EPF |
| **Branch** | `feat/KAN-65-epf-data-model` |
| **Date** | 2026-09-11 |

## Why

Epic KAN-64 adds EPF/PF tracking to Spendly. Every later ticket — contributions
(KAN-66), credit processing (KAN-67/68), transfers (KAN-69), interest (KAN-70) —
references an **establishment ID**, so the identity and employment-period model
has to land first and be right. This ticket delivers that model plus the minimal
UI to manage it.

Deliberately absent: any stored EPF balance. Per the epic, balance is always
derived from the contribution/interest ledger, never a manually editable field.

## Data model

```
users/{uid}/epfProfile/main          # single doc: UAN + employee identity
users/{uid}/epfEstablishments/{id}   # one doc per employment period
```

Two **sibling** collections, not a subcollection under the profile:

- The recursive owner grant in `firestore.rules` covers both with no rule change.
- KAN-66 will add `users/{uid}/epfContributions/{id}` carrying an
  `establishmentId`; a flat sibling keeps that a plain id reference and keeps a
  contributions query to one single-collection composite index.
- It matches the existing Spendly shape (`holdings`, `portfolioTransactions`,
  `sipPlans` are all flat siblings), and the fixed `main` doc id mirrors
  `portfolioSettings/config`.
- There is exactly one UAN per user, so a parent path segment would carry no
  information.

### Employment lifecycle — stored intent, derived presentation

`dateLeft` is the single source of truth. `employmentStatus` (`current` |
`previous`) is a stored denormalization that exists **only** because Firestore
cannot query "field is missing". The invariant is:

> `employmentStatus === "current"` ⟺ `dateLeft` is absent.

It is never read from a form. Writers always derive it with
`deriveEmploymentStatus(dateLeft)`, and readers recompute it in
`normalizeEstablishment`, so a document written by a future or buggy path still
renders correctly. There is no boolean `isActive` anywhere — the lifecycle is
the date pair plus the derived status, as the ticket requires.

`deriveEmploymentState` adds an `upcoming` presentation state for a joining date
in the future, and `archived` (below), which takes precedence over all of them.

### Archiving vs deletion

The epic forbids destructive deletion of financial history, so **archiving is
the normal way to remove an establishment from view**:

* `archived?: boolean` is an **orthogonal flag**, not a third `employmentStatus`
  value — that keeps the `current` ⟺ no-`dateLeft` invariant exact.
* Archived records are history, not a live employment: they are excluded from
  `findActiveEstablishment`, from the current-employment lock, and from overlap
  checks. So archiving a current job frees the slot for a new one, and an
  archived period never blocks a new one from overlapping its dates.
* Restoring an open-ended record re-checks the invariant, because another
  employment may have become current while it was archived.
* They sort last and live behind a collapsed "Archived (n)" section.

**Permanent deletion is still available, but only while nothing references the
establishment.** `deleteEstablishment` queries `epfContributions` for a single
matching document first and refuses if one exists, telling the user to archive
instead. The check fails closed: an inconclusive query aborts the delete rather
than risking an orphan. That collection does not exist until KAN-66, so the
query returns empty today and the guard starts working the moment contributions
ship.

### The single-current invariant

Exactly one establishment may have an open-ended leaving date. Enforced in two
layers:

1. **Client guard (primary).** `validateEstablishmentAgainstExisting` runs
   before every create and update. Works offline, gives a precise message
   naming the blocking employer, and is fully unit-tested in `shared/`.
2. **Transactional lock (race safety).** `runTransaction` reads only
   `epfProfile/main` and swaps its `activeEstablishmentId` pointer, so two
   devices cannot both claim a current employment.

   Client-SDK transactions can `get` documents but **cannot read queries**, so
   re-validating against the whole establishments collection inside a
   transaction is impossible. The pointer is the only thing writers can contend
   on. It is a derived, self-healing hint: `activeEstablishment` is always
   computed from the loaded list via `findActiveEstablishment`, never from the
   pointer, so a stale pointer never breaks the UI.

**Accepted limit:** overlap between two *closed* periods is client-guard-only.
It needs a collection query, which neither a client transaction nor a security
rule can express. The data is single-owner, and the invariant is re-checked on
every subsequent write.

Overlap uses a half-open interval `[dateJoined, dateLeft ?? ∞)`, so leaving on
2024-03-31 and joining elsewhere on 2024-03-31 is a normal handover and is
**not** an overlap.

## Files

| File | Role |
|---|---|
| `shared/features/epf/types/index.ts` | Domain interfaces, collection name constants |
| `shared/features/epf/schemas/index.ts` | zod form schemas (`.superRefine` for the date rule) |
| `shared/features/epf/utils/index.ts` | All decision logic — masking, derivation, overlap, sorting |
| `hooks/useEpf.ts` | Firestore listeners + CRUD; a thin shell by design |
| `components/epf/*` | Dashboard, profile card + modal, establishment card + modal |
| `shared/config/navigation.ts` | `"epf"` added to `INVESTMENT_HUB_TAB_IDS` |
| `app/(app)/investments.tsx` | Fourth tab in the Investments hub |
| `firestore.rules` | Collection inventory comment only — no rule logic change |
| `firestore/personalData.rules.test.ts` | Ownership cases for both collections |

Everything testable lives in `shared/features/epf/utils` because
`vitest.config.ts` only runs `shared/**`, `services/**` and `lib/**` — `hooks/**`
is never executed by `npm test`. If a conditional belongs in the hook, it belongs
in utils instead.

## Security

- Ownership is enforced by the existing recursive grant
  `match /users/{uid}/{collection}/{document=**}`. **No rule logic changed.**
- A stricter `match /users/{uid}/epfEstablishments/{id}` block was deliberately
  **not** added: Firestore ORs nested matches, so a narrower block cannot
  restrict what the recursive grant already allows. It would be dead code that
  reads like a security control.
- The hook uses the **duress-aware** `user.uid`, matching every other investment
  hook, so a duress session shows an empty EPF tree rather than the real UAN.
- UAN and PF member IDs are stored plain in the owner-scoped document and masked
  in list views with tap-to-reveal. **Masking is shoulder-surfing protection, not
  a security control** — anyone holding the user's session can read the full
  value. Reveal state is local component state, never persisted.
- UAN validation is strict on shape (12 digits after separator stripping) and
  lenient on input. No check-digit validation: UAN's checksum is not published as
  a stable contract, and a wrong implementation would lock out valid users.

## Indexes and migration

- `firestore.indexes.json` — **no change.** The establishments listener has no
  `orderBy` (sorting is client-side via `sortEstablishments`), which avoids a
  composite index and prevents a document missing the order field from being
  silently dropped. KAN-66 will need `epfContributions: establishmentId ASC +
  month DESC`.
- **No migration.** Both collections are new and no existing shape changed.
  Tolerant reads are built in from day one: `profileId` defaults to `main`,
  `employmentStatus` is always recomputed, `activeEstablishmentId` is treated as
  possibly stale or absent, and an empty-string `dateLeft` reads as "still
  employed".

## Tests

| File | Count |
|---|---|
| `shared/features/epf/utils/index.test.ts` | 37 |
| `shared/features/epf/schemas/index.test.ts` | 15 |
| `firestore/personalData.rules.test.ts` | 7 EPF cases added |

Full suite: 1855 unit tests and 158 rules tests pass, no regressions.

## Decisions taken

Recorded here so later tickets do not relitigate them.

| Decision | Outcome |
|---|---|
| Simultaneous employments | **Not supported.** Exactly one establishment may be open-ended. |
| Removing an establishment | **Archive by default**; permanent delete only while no contributions reference it. |
| Money units | **Rupee floats + `roundMoney()`**, consistent with the rest of the app. The epic's "integer minor currency units" wording is to be amended, not followed. Binding on KAN-66. |
| Duress mode | **EPF is hidden in duress sessions** (hook uses the duress-aware `user.uid`). A UAN ties to a real name and employment history — exactly what duress mode exists to conceal. |
| UAN check digit | **Not validated.** 12-digit shape only. EPFO does not publish the checksum as a stable contract, and a wrong implementation would reject valid UANs — a far worse failure than accepting a typo. |
| Sensitive identifiers | Stored plain in the owner-scoped doc, masked in lists with tap-to-reveal. |

## Open items for the rest of the epic

1. **There is no server-side cron.** Firebase Functions in `functions/` are
   explicitly not deployed (Spark plan cannot enable
   `cloudfunctions.googleapis.com`), and the only live server code is a
   client-triggered Netlify function. Spendly's recurring work runs client-side
   on app foreground (`shared/utils/subscriptionProcessor.ts`). **KAN-67
   ("Automated Credit Cron") cannot be built as specified** without a billing
   plan change.
2. **KAN-67 and KAN-68 overlap** heavily — both cover current-employment
   contribution generation and credit lifecycle. Consider merging or re-scoping.
3. **KAN-66 owns `epfContributions`.** When it lands, add the collection to the
   `firestore.rules` inventory comment and the composite index
   `establishmentId ASC + month DESC`. The delete guard here already queries it.

## Manual testing guide

Commands:

```bash
npm test                  # unit: EPF schemas + utils
npm run typecheck         # app
npm run typecheck:shared  # proves shared/features/epf has no RN imports
npm run test:rules        # Firestore emulator ownership (needs JDK 21+)
npx expo start            # hot reload covers the UI work
```

Rules are **not** deployed by CI — see `docs/FIREBASE_RULES_DEPLOY.md`. No rule
logic changed here, so no deploy is strictly required.

Device/browser steps (run on Android **and** Web):

1. Open **Investments**. The existing Investments / Stocks / Virtual SIPs tabs
   still render unchanged (regression check); a fourth **EPF** tab appears.
2. EPF tab with no data shows the "Track your EPF" empty state. Tap **Set up EPF**.
3. Enter an 11-digit UAN → inline "UAN must be exactly 12 digits". Enter
   `1001 2345 6789` with spaces → saves; the card shows `•••• •••• 6789`. Tap it
   to reveal, switch tabs and back → masked again.
4. Add establishment A: employer, establishment number, member ID, joined
   `2019-06-01`, "I still work here" on. Saves with a **Current** chip and
   "2019-06-01 – Present"; identifiers masked until the card is tapped.
5. Add establishment B, also still working → the form shows the conflict inline
   and the submit button is disabled; no document is created.
6. Edit A → turn off "I still work here" → set leaving date `2019-05-01` (before
   joining) → "Leaving date must be on or after the joining date". Set
   `2021-05-31` → A flips to **Previous**.
7. Add B joined `2021-06-01`, still working → succeeds. Also verify
   `2021-05-31` succeeds (same-day handover) and `2021-05-30` is rejected as
   overlapping.
8. Edit B, re-enable "I still work here" after setting a leaving date → the
   leaving date is actually removed (not stale) and the chip returns to
   **Current**.
9. Open A → **Archive establishment**. It leaves the main list and appears under
   a collapsed "Archived (1)" section. Expand it → A is there with an
   **Archived** chip, history intact.
10. Archive the *current* employer B, then add a new establishment with "I still
    work here" on → it succeeds, because an archived record no longer holds the
    current slot.
11. Open the archived B → **Restore establishment** → it is refused, naming the
    employment that is now current. Close that one, restore B again → succeeds.
12. Open any establishment → **Delete permanently** → a confirmation dialog
    appears (KAN-76). Cancel → nothing changes and the form stays open. Confirm
    → it is removed outright (no contributions exist yet). Once KAN-66 ships,
    repeat against one that has contributions and confirm it refuses with
    "Archive it instead". Archive and restore stay single-tap by design.
13. Force-quit and reopen (and hard-reload the web build) → profile and both
    establishments persist.
14. Airplane mode: add an establishment → the toast says it is queued; restore
    the network → the document appears in Firestore.
15. Settings → turn Investments off → the whole hub including EPF redirects to
    Ledger.
