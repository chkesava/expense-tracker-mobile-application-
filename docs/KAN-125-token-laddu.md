# KAN-125 — Token Laddu Management & Draw System

A pandal sells numbered Token Laddus from a printed receipt book through the
festival, then at Nimarjanam draws winners in front of a crowd. None of it
existed in Ganesh Seva: no token, no draw, no winner. The money was recorded, if
at all, as an ordinary collection with a note, and the draw was run on paper.

The part that makes this more than a list screen is the draw. A winning number is
read out to a crowd and can never be quietly re-rolled, so "the app does not
offer that button" is not a guarantee — anyone can call Firestore directly with
the same credentials.

## How it works

Five festival-scoped subcollections, all registered in the `festivalCol()` union
in `shared/utils/ganeshPaths.ts`:

```
pandals/{pandalId}/festivals/{festivalId}/
  tokenLadduConfig/current
    totalTokens, amountPerToken          // capacity; also the draw count
    nextTokenNumber                       // allocator — only ever advances
    registeredCount, cancelledCount       // concurrency control, not reporting
    capacityReason?

  tokenLadduRegistrations/{clientOpId}    // one purchase, one receipt
    participantName, mobile?, quantity, amount, paymentMethod
    receiptNumberPhysical                 // from the printed book
    receiptNumber?                        // the ledger's own GNS26-000182
    collectionId                          // the money lives there
    tokenNumbers: number[], festivalYear
    voided?, voidReason?                  // soft reversal

  tokenLadduTokens/{TKN26-000042}         // one physical laddu, one draw entry
    tokenNumber, status, registrationId
    participantName, mobile?, receiptNumberPhysical, date, amount, paymentMethod
    wonAt?, wonDrawSessionId?, wonDrawSequence?   // server-only

  tokenDrawSessions/{sessionId}
    status, startedBy, configuredTokens, plannedDraws, completedDraws
    shortfallAt?                          // where it stopped, and why

  tokenDrawResults/{sessionId}__{sequence}   // append-only, server-only
    tokenId, tokenNumber, participantName, sequence, drawnBy, eligibleCount
```

Two document ids carry most of the integrity, and both reuse a trick already in
this codebase:

- **A token's id is its code.** Uniqueness stops being a rule someone has to
  remember and becomes a property of the database — a second write to the same
  code is a create against an existing document and fails. Same mechanism as
  `pandalInvites/{code}` and `festivalYears/{year}`.
- **A draw result's id is `{sessionId}__{sequence}`.** Two admins racing the same
  draw cannot both commit.

The `nextTokenNumber` allocator lives on the config document rather than
`summary/totals`. The summary rule is documented as sitting against Firestore's
hard 1000-expression evaluation ceiling and has `ganeshSummaryBudget.rules.test.ts`
guarding it; a fourth allocator there would spend budget on the rule that can
least afford it.

### Accounting position

| | Effect |
|---|---|
| Money | A registration writes an ordinary `GaneshCollection` in the same transaction and stores its `collectionId`. |
| Festival totals | Flow through the existing ledger derive. No new summary field, no new maths. |
| Double counting | Impossible by construction: the Token Laddu documents carry no money of their own and are **not** in `LEDGER_SUBCOLLECTIONS`. |
| Receipt numbers | Two, deliberately. `receiptNumberPhysical` is what the participant holds; `receiptNumber` is what the ledger calls the money. Both separately searchable. |
| Per-token amount | The purchase split across its tokens, remainder included, so the PDF's column total equals the cash collected. |
| Cancellation | Tokens become ineligible; the collection row is **untouched**. See below. |

### Behaviours worth knowing

1. **Cancelling a registration does not reverse the money.** The tokens leave the
   draw, but the collection row stays and the cash stays in festival totals until
   someone voids it through the existing flow. Reversing it here would
   double-reverse — the bug class `GANESH_SEVA_AUDIT_2026-09-03` found six of
   (N-01…N-06). If the committee wants one action to do both, that is a
   deliberate follow-up, not an oversight.
2. **`registeredCount` never winds back.** A cancelled token keeps the number it
   was given, so a code already handed to a participant can never be reissued to
   someone else. Capacity is measured against tokens *created*, not tokens still
   in the pot.
3. **Registration and the draw are online-only**, and say so. Both read a count
   and write against it, which requires a transaction, and transactions cannot
   commit offline (`services/ganesh/ganeshWriter.ts`). Queueing either would mean
   two phones handing out the same token number, or a winner fabricated on a
   device and synced later.
4. **A shortfall is an outcome, not an error.** Fewer eligible tokens than
   remaining draws means draw the real winners and stop, recording `shortfallAt`.
   It never fills the gap by drawing anyone twice.

### Safety

- **The draw is server-only.** `netlify/functions/ganesh-draw.ts` chooses *and*
  writes; Firestore rules deny every client write to `tokenDrawResults`, and a
  token's winner fields sit outside the update allowlist so a client cannot crown
  or un-crown one even holding `tokens.write`. The Admin SDK bypasses rules,
  which is what makes this a guarantee rather than a UI convention. Cloud
  Functions need Blaze and this project is on Spark, so the trusted writer lives
  on Netlify — the same reason `ganesh-summary` does.
- **Authorization is decided in the function**, from the member document. The
  Admin SDK ignores rules, so there is no second gate behind it.
- **Idempotent by construction.** A registration's document id is the form's
  `clientOpId`, so a double tap or a retry finds its own write and stops. A draw
  result's id encodes its sequence, so a retry cannot add an extra winner.
- **Atomic or nothing.** Quantity N creates all N tokens, the registration, the
  ledger row and the allocator bump in one transaction, or writes nothing —
  asserted by a fake `runTransaction` that stages writes and commits only on
  success.
- **Selection is `crypto.randomInt`**, not `Math.random`. A predictable PRNG is
  the wrong tool for something announced publicly.
- **Nothing is deleted.** `allow delete: if false` across the wildcard; a
  registration holding a winner cannot be cancelled at all.
- **Permissions are three, not one.** `tokens.write` sells; `tokens.config` sets
  capacity, which is the only legitimate way past it; `draw.run` picks the
  winner. `tokens.read` is withheld from `viewer` because a token row carries the
  participant's name and mobile — the donor PII GS-073 already keeps from that
  role. None has a legacy role fallback: these keys did not exist when the old
  member documents were written, so `ensurePandalRoles` grants them.
- **The registration needs `collections.create` too**, checked up front in
  `useGaneshWrites`. It writes a ledger row, so `tokens.write` alone dies
  half-way through the transaction as a bare permission-denied. Deliberately not
  an implied permission — selling a laddu should not confer general
  collection-writing authority.

## Where it appears

- **Pandal tab → This Festival → Token Laddu** (gated on `tokens.read`).
- **Overview** — capacity, registered, remaining, collected, payment-method
  split, draws done/left, winners. Capacity setup lives here; reducing it asks
  for a reason and confirms destructively.
- **Register** — the form, with the allocated codes shown afterwards for reading
  out to the participant.
- **Token Laddus** — every token, searchable by code, receipt, name, mobile or
  date, filterable by status, and the PDF export.
- **Draw** — start the session, then one winner at a time. Nimarjanam is a live
  event, not a batch job.
- **Winners** — draw order, surviving reload, with the shortfall or completion
  state stated.

## Automated tests

```
npm test            # 2606 pass — incl. ganeshTokenLaddu (pure), .write, Export, DrawRemote
npm run test:rules  # 203 pass — incl. firestore/ganeshTokenLaddu.rules.test.ts (23)
npm run typecheck && npm run typecheck:shared
npm run build:netlify-fns     # the draw function must bundle
npm run build:web:ganesh      # the module graph must resolve
```

Coverage maps to the ticket's acceptance scenarios: quantity expansion (1, 2),
duplicate submission (3), id collision (4), capacity (5), cancellation (7),
shortfall (8), completion (12), export before and after the draw (13, 14), a
500-token register (15), and unauthorized access (18).

Scenarios 9, 10 and 16 — a token winning twice, two admins drawing at once, and
a realtime update from another user — are **not** proven by these tests. What is
proven is the mechanism they rest on: the rules refuse every client write to a
draw result, and `resolveDrawOutcome` never issues the same sequence twice. The
race itself needs two real clients against a deployed function.

Two rules tests pin the exact payloads `openTokenDrawSession` and
`closeTokenDrawSession` write against the rules allowlist, because the service
and the rules are authored apart and drift silently otherwise.

## Manual testing guide

No commands beyond `npx expo start` — **but the Draw tab needs both deploys
below**. Everything else works against the live project once the rules are out.

### 1. Setup
Pandal tab → This Festival → **Token Laddu**. As treasurer you should see the
empty state. Set **500** laddus at **₹100**. Overview shows 500 / 0 / 500.

### 2. The acceptance scenario
Register → name, receipt number from the book, quantity **5**. The amount should
read ₹500 as 5 × ₹100. Save. Expect **five** codes `TKN26-000001…000005`, all
against the one receipt. Check Pandal Nidhi rose by ₹500 **once**, and the
collections list has exactly one new row.

### 3. Duplicates and capacity
- Double-tap save → one set of tokens, not two.
- Set capacity to 5, then try to register a 6th → refused, naming how many are
  left. Raise capacity and it proceeds.
- Try to reduce capacity below what is registered → refused.

### 4. The list and the export
Search by token code, by receipt number, by name, by mobile. Filter by *In the
draw*. **Export all to PDF** → a file named like
`<Pandal>-token-laddu-2026-09-17.pdf`, summary on top, every token on its own
line. Register 5 more and re-export: the order must not reshuffle.

### 5. The draw
Draw tab → **Start the draw** → confirm. Draw repeatedly. Each winner shows a
distinct code and appears in Winners in order. Reload the app mid-session: the
committed winners are still there. Complete every draw → the action disables.

### 6. Shortfall
On a fresh festival set capacity **5** but register only **2**. Start the draw
and draw. It should produce exactly **two** winners then stop with the shortfall
message — never five.

### 7. Offline
Airplane mode → registration refuses with a connectivity message; the draw
refuses outright and **no local winner appears**.

### 8. Permissions
- As a `viewer`: the Token Laddu row does not appear on the Pandal tab at all.
- As a member with `tokens.read` only: no Register tab, no Draw tab.
- As a treasurer: everything.

### 9. Concurrency — needs two devices
Two admins on the Draw tab, both tapping **Draw** at once. Exactly one result per
sequence; no token wins twice. This cannot be proven by unit tests.

### 10. Regression — none of this may change
Collections, contributions, expenses, the festival report and Pandal Nidhi
totals. Expense and Nutrition are untouched — nothing shared was modified.

### 11. Platforms
A small Android phone (five chips scroll horizontally), and web
(`npm run web`).

## Deployment note

**Unlike most work in this repo, two deploys are part of this feature and it does
not work without them.**

1. **`firestore.rules`** — until deployed, `tokenDrawResults` is unprotected in
   the live project and the server-only guarantee is inert. One Firebase project
   serves dev and prod with no staging, so verify in the emulator first
   (`npm run test:rules`, which the predeploy hook runs anyway). See
   `docs/FIREBASE_RULES_DEPLOY.md`. The headline finding of
   `GANESH_SEVA_AUDIT_2026-09-03` was rules written but never deployed.
2. **The Netlify function** — `npm run build:netlify-fns`, then deploy the site.
   `FIREBASE_SERVICE_ACCOUNT` must be set on it. Until then the Draw tab fails
   with "Cannot reach the server".

**No index deploy.** The queries are deliberately single-field so none is needed:
`firestore.indexes.json` is a strict subset of the live project and
`firebase deploy --only firestore:indexes` deletes anything absent from it
(`docs/KAN-75-epf-index-query-review.md`).

**No backfill.** Nothing exists to migrate; `tokenLadduConfig/current` is created
on first save. `ensurePandalRoles` unions the new permission keys onto existing
builtin role documents the way Seva's did.
