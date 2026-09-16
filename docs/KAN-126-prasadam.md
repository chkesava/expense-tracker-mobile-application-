# KAN-126 — Daily Morning & Evening Prasadam Management

A pandal is fed twice a day, every day of the festival, by whoever in the
community brings something. Ganesh Seva had nowhere to record it. `SevaKind`
already had a `"prasadam"` value, but that is a *slot on the programme*
("annadanam, 6pm") — not a register of who actually brought what. So it was
tracked on paper or not at all, and at the end of a festival nobody could say
who fed the pandal on day four.

The part that makes this more than a list screen is that a session has no
natural owner. Three people bring prasadam to one morning; the same person
brings again that evening and twice more that week; two volunteers are recording
at the same counter at the same moment. Every one of those has to survive, and
none of them may overwrite another.

## How it works

One festival-scoped subcollection, registered in the `festivalCol()` union in
`shared/utils/ganeshPaths.ts`:

```
pandals/{pandalId}/festivals/{festivalId}/
  prasadamEntries/{clientOpId}          // one offering, one document
    date, session                        // yyyy-mm-dd + morning|evening
    providerName, mobile?                // snapshot, always
    providerId?, providerSource?         // optional link to household/member
    prasadamType, prasadamLabel?         // "sweet" + "Laddu"
    quantity, unit, unitLabel?           // a number and its unit, never free text
    notes?, sevaId?
    status: recorded | cancelled
    cancelReason?, voided, voidReason?, voidedBy?, voidedAt?
    createdBy, createdAt, updatedBy, updatedAt
```

Three decisions carry the integrity of the feature.

- **The document id is the form's `clientOpId`.** Minted once per form mount, so
  a double tap or a retried write re-targets the same document and can never
  mint a second row. Same mechanism as `addContribution` and
  `registerTokenLaddu`. It is deliberately **not** a composite id like
  `date__session__providerId` — that shape is precisely what makes the second
  provider in a session overwrite the first, which is the thing this ticket
  exists to prevent.

- **A session is not a document.** Morning and evening are values on the entry;
  a session's counts, status and empty state are derived from the entries
  carrying them. A stored session document holding `entryCount` would be shared
  mutable state, and the two volunteers at one counter would clobber it —
  or need `increment()` (drifts on retry) or a transaction (which would kill
  offline recording). Each writer touching only its own document is the whole
  concurrency story.

- **There is no money here at all.** No `amount`, no `estimatedValue`, no
  `purposeType`. The rules *enforce* their absence rather than trusting a
  comment, which is what makes "prasadam can never be double-counted" a property
  of the database. These documents are absent from `LEDGER_SUBCOLLECTIONS`.

### Accounting position

| | Effect |
|---|---|
| Money | **None.** The register carries no amount field, and `prasadamCarriesNoMoney()` refuses any write that adds one — for every role, admin included. |
| Festival totals | Untouched. Nothing here reaches `summary/totals`, and the writers use `run`, not `runLedger`, so no summary rebuild is even scheduled. |
| Double counting | Impossible by construction: there are no rupees in these documents to count twice. |
| Prasadam that cost money | Stays an ordinary `GaneshExpense`, exactly as before. |
| The `estimatedValue` temptation | `GaneshContribution` kind `"item"` *does* carry a value and *does* reach `summary.inKindValue`. Do not harmonise the two. If someone needs to know what the prasadam was worth, the answer is to record a contribution — adding a field here silently reintroduces the double count this design exists to prevent. |

### Behaviours worth knowing

1. **Quantities are a vector, not a scalar.** `summarizePrasadamEntries` returns
   `byUnit` and has no `totalQuantity` sibling, because "5 kg + 30 pieces" has no
   single value. There is deliberately no API in this feature that can produce
   one, and the PDF prints per-unit lines with no grand total. A single "total
   prasadam today" figure is not expressible and is rendered as an entry count
   instead.

2. **`date` and `session` are immutable after creation.** They sit outside both
   the service's update payload and the rules' allowlist. Moving an entry
   between sessions would make a day's counts irreconcilable against its own
   history, so relocating one is a cancel and a fresh record — which leaves both
   halves visible.

3. **Cancellation is terminal.** A cancelled entry can be neither edited nor
   restored. Correcting a mistaken cancellation means recording a new entry,
   which keeps the correction in the audit trail instead of rewriting history.
   There is no undo button, and that is the design.

4. **Recording works offline, unlike KAN-125's registration.** Every path is a
   plain `writeBatch`. Nothing reads a counter, checks a capacity or allocates a
   number, so there is nothing a concurrent writer could invalidate and nothing
   a transaction would buy. Meanwhile the use case is the strongest offline case
   in the app: a volunteer at a prasadam counter with no signal. The duplicate
   check is wrapped so an offline cache miss degrades to "write it" — a
   duplicate is recoverable, a silently dropped offering is not.

5. **A duplicate provider is a warning, never a block.** The same person
   legitimately brings two different items to one session, and the ticket
   requires that to be recordable.

6. **A past session with nothing recorded is `missed`, not `not-started`.**
   "Nobody brought prasadam that evening" is a fact worth showing, not a pending
   action someone still has to do.

### Safety

- **Permissions are three, not one.** `prasadam.write` is deliberately *wider*
  than `seva.write` (member and collector hold it) because the people recording
  are counter volunteers, not the committee that plans the programme.
  `prasadam.cancel` is *narrower* because reversing a recorded offering is the
  audited correction. `prasadam.read` is withheld from `viewer`: the register
  names every devotee who fed the pandal and carries their mobile number, which
  is the donor PII GS-073 already keeps from that role — the same reason
  `tokens.read` is withheld.
- **No legacy role fallback.** These keys did not exist when the old member
  documents were written, so `ensurePandalRoles` grants them rather than a role
  string implying them.
- **A dedicated rules branch**, short-circuited away from the shared wildcard.
  None of `payloadWellFormed()`'s nine money/purpose sub-predicates can apply to
  an entry, and the wildcard is documented as sitting at Firestore's
  1000-expression evaluation ceiling. `ganeshSummaryBudget.rules.test.ts` is
  unchanged and still passes.
- **An entry cannot be born cancelled**, so a reversal is always a transition
  out of a recorded state and the audit trail always shows what was reversed.
- **Nothing is deleted.** The wildcard's `allow delete: if false` covers the new
  subcollection, and a test asserts it for admin.
- **Two update rules, not one.** The edit path cannot touch `status`, so an edit
  can never become a cancellation that skipped the narrower permission; the
  cancel path cannot touch anything but the status and the void trail.

## Where it appears

- **Seva tab → Prasadam** (gated on `prasadam.read`), with a live meta line —
  "Morning 3 · Evening 2", or "Nobody recorded for today yet" — plus a quick
  action tile gated on `prasadam.write`.
- **Home → Prasadam** quick action, in the existing `GaneshQuickActions` grid.
- The five-tab bottom navigation is unchanged.

The screen itself is one hub (`app/(ganesh)/prasadam/index.tsx`) with five chip
sections, plus a detail route for a single entry:

- **Overview** — the selected day: providers, entries, sessions done, and the
  two sessions side by side from 600dp.
- **Morning** / **Evening** — the full session, its status, its providers, and
  the form.
- **History** — every entry, grouped by day, searchable by provider, item or
  mobile and filterable by session and status.
- **Report** — range presets, a preview built from the *same* builder that
  produces the file, then PDF or CSV.

A day strip runs across the top with **two dots per day** — left for the
morning, right for the evening — so a committee reads the whole festival's
coverage without opening a single day.

Morning and evening are told apart in exactly one place, `useSessionTone`:
sunrise + vermilion versus sunset + maroon, each with its own icon, its own word
and its own window label, so colour is never the only signal. Maroon is safe
here specifically because this screen contains no money at all, so it cannot be
misread as the Permanent Fund identity it carries in the financial vocabulary.

### The add flow

The form renders **inside** the session card rather than as a pushed route. The
requirement that adding the next provider must not mean leaving the session is a
statement about navigation cost: a pushed form is push → fill → back → find the
session again, five times over for five providers.

"Save and add another" is the primary button. It clears the provider, item,
quantity and note; **keeps** the session, the day and the unit chip (a provider
run is usually all pieces or all kg); fires a success haptic, an inline "recorded
— add the next provider" strip and a rising count; and mints a fresh
`clientOpId`. It suppresses the hook's toast, because a toast per provider over
six providers is noise rather than feedback. On failure every value is kept and
the same id is reused, so a retry cannot produce two entries.

## Automated tests

```
npm test            # 2684 pass — incl. ganeshPrasadam (40), .write (23), Export (15)
npm run test:rules  # 239 pass — incl. firestore/ganeshPrasadam.rules.test.ts (36)
npm run typecheck && npm run typecheck:shared
npm run build:web:ganesh      # the module graph must resolve
```

Coverage maps to the ticket's numbered edge cases: one provider (1), three in a
morning (2), two in an evening (3), the same person across both sessions (4) and
across days (5), multiple items from one person (6), appending to a session
without overwriting (7), duplicate submission (8), edit and cancel with the
audit trail retained (10), cancelled entries excluded from totals but kept (11),
an empty session's state (12), incompatible units never combined (13), entries
staying with their original day (14), and unauthorized access (16).

Scenarios 9 and 15 — two authorized users adding concurrently, and a realtime
update surviving a reload — are **not** proven by these tests. What is proven is
the mechanism they rest on: the write tests assert that two entries in one
session produce two documents whose payloads reference neither each other nor
any shared counter, container or summary document, so there is no write for a
concurrent writer to lose. The race itself needs two real devices.

## Manual testing guide

`npx expo start`. Everything works against the live project once the rules are
deployed.

### 1. Setup
Seva tab → **Prasadam**. As treasurer you should see the empty state and the day
strip. Pick a day.

### 2. The acceptance scenario
Morning → **Add provider** → record three different people using **Save and add
another** each time. Expect: all three rows present, the count reading
`3 providers`, the unit chip still on your last choice, the provider field
cleared and focused, and no toast per provider.

### 3. Sessions stay apart
Switch to Evening, add two providers. Morning must still show three. Add the
*same person* to both sessions — two independent entries, and the day's provider
count treats them as one person who fed the pandal twice.

### 4. Duplicates and offline
- Double-tap save → one row, not two.
- Airplane mode → the row appears immediately with the pending glyph and syncs
  on reconnect. (Recording is deliberately **not** blocked offline.)

### 5. Units
Record 5 kg from one provider and 30 pieces from another in the same session.
The summary must read "5 kg · 30 pieces" and must never produce a single number.

### 6. Correcting
Open an entry → **Edit**. The day and session are read-only pills. Change the
quantity and save. Then **Cancel this entry**: the confirmation names the real
provider, item, session and date. Afterwards the row is marked cancelled, the
totals drop, and it can be neither edited nor un-cancelled.

### 7. History and export
Search by name, mobile and item. Filter by session and by status. Tap a day
header — it should jump the strip and Overview to that day. Export PDF and CSV:
every provider on their own line, **no rupee column anywhere**. Add more entries
and re-export — the order must not reshuffle.

### 8. Permissions
- As a `viewer`: the Prasadam row does not appear on the Seva tab at all.
- With `prasadam.read` only: the screen renders fully, with no add, edit or
  cancel affordance and a line saying so.
- With `prasadam.write` but not `prasadam.cancel`: recording and editing work,
  the cancel button is absent.

### 9. Concurrency — needs two devices
Two people recording into the same session at once. Both entries must survive.
This cannot be proven by unit tests.

### 10. Regression — none of this may change
Seva, collections, contributions, expenses, the festival report and Pandal Nidhi
totals. Expense and Nutrition are untouched — every new file is under
`app/(ganesh)/`, `components/ganesh/`, `services/ganesh/` or
`shared/**/ganeshPrasadam*`.

### 11. Platforms
A small Android phone (the chips and the day strip scroll horizontally, the two
save buttons stack), a tall iPhone, and web (`npm run web`).

## Deployment note

**`firestore.rules` must be deployed.** Until then `prasadamEntries` is
unprotected in the live project and every guarantee above is inert. One Firebase
project serves dev and prod with no staging, so verify in the emulator first
(`npm run test:rules`, which the predeploy hook runs anyway). See
`docs/FIREBASE_RULES_DEPLOY.md`. The headline finding of
`GANESH_SEVA_AUDIT_2026-09-03` was rules written but never deployed.

**No index deploy.** Every query is deliberately single-field — one listener
ordered by `date`, with session, provider, type and status all filtered in
memory — so none is needed. `firestore.indexes.json` is a strict subset of the
live project and `firebase deploy --only firestore:indexes` deletes anything
absent from it (`docs/KAN-75-epf-index-query-review.md`).

**No backfill and no Netlify function.** Nothing exists to migrate.
`ensurePandalRoles` unions the three new permission keys onto existing builtin
role documents the way Seva's and Token Laddu's did.

## Known limits

- The register listener is capped at 1000 documents. That is a runaway guard,
  not pagination — a festival is ~11 days × 2 sessions × a few dozen providers.
  The export reads the same in-memory list, so a report can never claim more
  completeness than the listener has. A multi-year archive view is out of scope.
- "Session status" is derived from the clock and the entries. If a committee
  ever wants to explicitly *close* a session, that is a stored session document
  with its own rules branch and contention handling — a follow-up, not something
  any listed acceptance behaviour needs.
- `SevaKind = "prasadam"` and `prasadamEntries` coexist permanently. Both files
  carry a comment naming which is which; renaming the seva value would rewrite
  stored documents.
- Strings are hardcoded English, matching every existing Ganesh screen. No
  Ganesh screen currently routes through `LocalizationProvider`; that rollout is
  its own piece of work.
