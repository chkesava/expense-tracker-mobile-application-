# Public split share links — audit and hardening, 2026-08-22

**Scope:** audit **and** hardening. Every issue is logged in full below, with
what it is, why it matters, a concrete failure scenario, and its current state.

**Trigger:** the public split share link and the drop-out recalculation shipped
in `3704938` ("feat: add public split share links and drop-out recalculation",
23 files) were reported as not working.

**Headline finding:** almost all of the feature was already correct. It had no
host. `EXPO_PUBLIC_APP_URL` points at `kesavaexpensetracker.netlify.app`, which
is a **different repository** (the Vite web app this project migrated from).
This repo had no `netlify.toml`, no `_redirects`, and no `expo export` script,
so the Expo web build was never produced or deployed anywhere. Every share link
ever sent resolved to that other app's SPA shell and landed the recipient on a
**login screen**.

---

## How the live state was established

Verified during the audit rather than assumed:

- `GET https://kesavaexpensetracker.netlify.app/split/<slug>` returns that
  site's SPA shell (favicon `/vectorized.svg`) and renders its login page. Its
  `/split/:id` route is inside the auth-gated tree (`src/App.tsx`) and reads the
  private `splits` collection.
- `GET /api/stock?symbol=RELIANCE` on that origin returns live quote JSON, and
  `/mobile-google-auth` serves HTML. Both are consumed by this app
  (`services/marketDataService.ts`, `lib/googleAuthBridge.ts`), so that site
  **cannot** be replaced with the Expo export.
- **Which `firestore.rules` file is deployed was an open question** — the two
  repos ship different, incompatible files. Resolved empirically: an anonymous
  browser reads `splitPublicShares` successfully, and both mobile write paths
  mint auto-ids while the Vite repo's rules require `resource.data.slug ==
  <docId>` on `paymentRequests` (which would deny every mobile create). **This
  repo's rules are the deployed ones.** Recorded in
  `docs/FIREBASE_RULES_DEPLOY.md`.

---

## Issues

### P0-1 — The public pages were never deployed (root cause)

**What:** `app/split/[slug].tsx` and `app/payment/[slug].tsx` existed and
worked, but no build pipeline produced or published them.

**Why it matters:** the entire feature was a share button emitting a URL that
resolved to another app's login screen. Every recipient hit a dead end.

**Failure scenario:** organizer taps Share on a 15-person gift pot, sends the
WhatsApp link to 15 people, and all 15 are asked to sign in to an app they have
no account for.

**State: fixed.** `netlify.toml`, `public/index.html`, `public/robots.txt` and a
`build:web` script added; deployment goes to a new Netlify site with
`/split/*` proxied from the original origin so links already sent keep working.

### P0-2 — `web.output: "static"` cannot render a runtime slug, and fails silently

**What:** static rendering requires `generateStaticParams`, which does not exist
anywhere in the repo. Slugs are minted at runtime, so there is no build-time
list to generate from.

**Why it matters:** no build error is raised. The exporter emits a literal
`dist/split/[slug].html` — a bracketed filename that cannot be routed to — and
renders it with `slug === undefined`.

**Failure scenario:** the deploy succeeds, the smoke test of `/` passes, and
every real share link 404s or renders an empty split.

**State: fixed.** `web.output` is now `"single"` with an SPA fallback in
`netlify.toml`. As a second benefit this skips the SSR pass entirely; under
`static`/`server` the whole root provider tree (Firebase, AsyncStorage,
SecureStore, reanimated) would execute under Node at build time.

### P0-3 — The organizer had no way to know a share link was missing

**What:** `publicSlug`/`publicShareId` were only minted on create or as a side
effect of toggle-paid / collect / settle / opt-out. Splits created before the
feature had neither, so `handleShareSplit` computed `shareUrl = undefined` and
`generateSplitGroupShareMessage` silently omitted the URL section. The Share
button was never disabled and no error was raised.

**Why it matters:** the failure is invisible. The organizer believes they sent a
link.

**Failure scenario:** organizer opens a split from last month, taps Share, sends
a message containing a title and a list of who owes what — and no link at all.

**State: fixed.** New `shared/utils/splitShareLink.ts` decides what is missing;
`useSplits.ensureSplitSharing` repairs it in one batch on demand; the Share
button shows a spinner, is disabled while in flight, and **never reaches the
share sheet without a URL** — it toasts instead.

### P0-4 — Per-person Pay buttons could never appear, and adding a UPI id never repaired it

**What:** `buildParticipantShareRequests` returns `[]` when `!params.upiId`
(correct — no UPI means no payment page can exist), so no `paymentSlug` was
stored. The public page's `canPay` gate requires `personSlug`, so it was
permanently false. `applyShareSideEffects` only *patched* requests that already
existed and never back-filled.

**Why it matters:** the organizer's obvious remedy — add a UPI id in Settings —
did nothing, with no explanation.

**Failure scenario:** organizer creates a split before setting a UPI id, later
sets one, reshares, and the public page still shows no way to pay. Nothing in
the app says why.

**State: fixed.** `buildParticipantShareRequests` gained `skipExisting`, and
`ensureSplitSharing` back-fills missing requests idempotently. When there is
genuinely no UPI id the organizer now gets the reason: *"Add your UPI ID in
Settings to create pay links."*

### P1-5 — Anonymous visitors always saw INR

**What:** `app/split/[slug].tsx` fell back to
`useSystemSettings().settings.defaultCurrency`, but `system_settings/global`
requires sign-in, so an anonymous read always fails and
`DEFAULT_SETTINGS.defaultCurrency` ("INR") always won. `share.currency` was
never populated either, because `buildSplitPublicSharePayloadFromSplit` only
sets it from `extras.currency` and `hooks/useSplits.ts` never passed one.

**Why it matters:** amounts were rendered in the wrong currency for every
non-INR user, and each page view logged a guaranteed permission-denied warning.

**Failure scenario:** a user with USD as their currency shares a $400 dinner;
recipients see ₹400.

**State: fixed.** The currency is threaded onto every public snapshot and
payment request at the source, and both public screens no longer touch system
settings at all.

### P1-6 — "Extra due after a drop-out" was indistinguishable from "unpaid"

**What:** the public page inferred a top-up from `paidAmount > 0`. That
heuristic only worked by accident: nothing else in the codebase produced a
partial payment.

**Why it matters:** the exact case that prompted this work — 10 people, 8 paid,
2 refuse — produced a public page telling eight people who had already paid in
full that they were simply "unpaid", with no hint of why the number changed.

**Failure scenario:** eight people who paid ₹100 each see "Unpaid ₹25" and
conclude the organizer lost their money.

**State: fixed.** `Participant.shareRaised` is now recorded explicitly by
`recalibrateSplitAfterOptOut`, mirrored onto the public row, and rendered as
*"Extra ₹25.00 due after Friend 8 dropped out"* by
`publicParticipantStatusLabel`. Recording it rather than deriving it also
survives Phase 4's genuine partial payments, which would have broken the
heuristic.

### P1-7 — The public pages were one-shot reads

**What:** both `usePublicSplitShare` and `usePublicPaymentRequest` used
`getDocs` with no refresh control.

**Why it matters:** a friend watching the page never saw anyone else's payment
land, and a QR could keep showing money already collected.

**State: fixed.** Both converted to `onSnapshot` with `useLoadFailure` +
`snapshotErrorHandler`, and both screens now render a Retry via the existing
`ErrorState` when the failure is retryable.

### P1-8 — Revoking public updates could silently un-revoke itself

**Found while implementing, not in the original code.** `claimsEnabled` computed
as `params.claimsEnabled !== false` writes `true` for `undefined`, so any later
routine write (toggle paid, collect, settle) would have re-enabled a link the
organizer had deliberately closed.

**State: fixed before shipping.** The private `splits` doc now owns
`claimsEnabled` and the public share is a mirror; `applyShareSideEffects` falls
back to `split.claimsEnabled` rather than defaulting to on.

### P2-9 — `/_sitemap` would have been publicly reachable

**What:** expo-router appends its sitemap route in production too.

**Why it matters:** the new host would have published a browsable list of every
route in the app.

**State: fixed.** `["expo-router", { "sitemap": false }]`.

### P2-10 — Console noise on every public page view

**What:** `GoogleSignin.configure()` ran unguarded in `AuthProvider`, which on
web logs a sponsorship notice; `SecureStore.getItemAsync` always rejects on web.
Separately, one listener per participant meant a single claims failure logged
once per participant (observed: 14 identical permission-denied lines).

**State: fixed.** Both platform-guarded; claim-listener failures are now
reported once per subscription.

### P2-11 — A share written before self-service blamed the organizer

**What:** `claimsEnabled` absent and `claimsEnabled: false` both close the link,
but the footer described both as the organizer having turned updates off.

**State: fixed.** The three states are now distinguished, and the neutral copy
is used when the flag is simply absent.

---

## Open issue

### P1-12 — `allow read: if true` permits collection enumeration

**What:** `allow read` covers `list`, not just `get`. Both public hooks query
`where("slug", "==", …)`, which *is* a `list`, so the permission is load-bearing
and cannot simply be tightened.

**Why it matters:** anyone holding the public Firebase project id can enumerate
**every** `paymentRequests` document — including every `upiId` — and every
`splitPublicShares` document, without knowing a single slug.

**Confirmed live during this audit,** unauthenticated, via the Firestore REST
API: 19 `paymentRequests` documents readable, exposing the organizer's UPI id,
and the full `splitPublicShares` collection including participant names and
amounts. Blast radius today is one UPI id and one split, but it grows with use.

**Failure scenario:** a scraper harvests every payment request in the project and
mass-messages the UPI ids, or files a self-service claim against every share it
finds.

**Why it is not fixed here:** the correct fix is to make the slug the **document
id** for both collections, then `allow get: if true; allow list: if false;` —
exactly what `splitShareClaims` does from day one — with both hooks switching to
read by id. That is a data migration plus a change to `linkedLedgerIds` and
every `doc(collection(db, …))` mint site, and it deserves its own phase rather
than riding along with a feature fix.

**Interim mitigation:** `claimsEnabled` is an organizer kill switch, and every
claim is organizer-reviewed, so enumeration cannot itself move money.

---

## The new unauthenticated write surface

`splitShareClaims` is the only collection in the project that accepts a write
from someone who is not signed in. The reasoning, recorded so it is not
re-litigated from scratch:

**There is no capability boundary on the group link and there cannot be one.**
`personSlug` and `claimKeys` are published in a world-readable document, and a
secret stored in a world-readable document is not a secret. So **anyone holding
the link can file a claim as anyone.** No token scheme fixes this.

**Therefore a claim changes nothing on its own.** It credits no account and does
not alter the public snapshot. The organizer applies it with their own
credentials from inside the app. That review step *is* the security model.

**Firestore rules cannot iterate a list of maps,** so an anonymous client could
not be constrained to touching only its own row of
`splitPublicShares.participants` — allowing that write at all would let a
stranger rewrite every row's amounts. Hence a separate collection plus a pending
overlay on read (which is also faster, since the local cache echoes the
visitor's own write before the server acks).

**What bounds the write volume,** given rules cannot do rate limiting at all (no
IP, no counters, no time-window aggregates):

- The document id is derived from `(shareId, participantKey)`: one slot per
  person per split.
- `create` is the only anonymous verb. An existing document turns a client
  `setDoc` into an `update`, which is denied.
- Anonymous `delete` is denied, because delete-then-create would reset the
  budget and make the volume unbounded again.
- Net budget: **one write per participant per split**, re-armed only when the
  organizer applies or dismisses.
- `claimsEnabled` is a per-split kill switch, and a share without the flag is
  closed.

**Accepted residual risk:** a link-holder can file one claim per participant per
split, and can file it as somebody else. The organizer sees who claimed what and
confirms or dismisses each one. Ledger-affecting paths (`collect` credits, which
need an account id, and opt-outs, which raise everyone else's share) always
require an organizer tap.

**Not executable in CI:** `shared/utils/splitClaims.rules.contract.test.ts` is a
hand-written mirror of the `allow create` clauses, not a rules execution — there
is no emulator in the test setup. It must be updated by hand alongside
`firestore.rules`. It does prove the client never constructs a payload the
server would reject, and that each clause is individually violable and caught.

---

## Verification performed

- `npm run typecheck` and `npm run typecheck:shared`: clean. (One pre-existing
  error in `components/dashboard/InvestmentsWidget.tsx` comes from a stale,
  gitignored `.expo/types/router.d.ts` and is present on the baseline too.)
- `npm test`: 961/962. The single failure, `shared/utils/magicParser.test.ts`,
  is a pre-existing timezone bug in the test itself (`toISOString()` yields a
  UTC date while the parser uses the local one) and fails on the baseline at the
  same hour. 134 tests added by this work.
- `npx expo export --platform web`: succeeds. Entry bundle 1.42 MB gzipped.
  `dist/assets/` contains exactly two subtrees, `assets/` and `node_modules/`,
  which is what the proxy rules must cover.
- `firebase deploy --only firestore:rules --dry-run`: rules compile against the
  live project.
- The real 15-person gift pot renders end to end from a local SPA build with no
  login: title, organizer, total, every participant's paid/unpaid state, and Pay
  buttons on the unpaid rows.
- Self-service UI exercised in-browser: "This is me" appears on exactly the
  unpaid non-organizer rows, expands to the two actions, and shows the confirm
  step with the amount and organizer name. Submitting with the rules not yet
  deployed was **correctly denied** — no document was created, and
  `[splitClaims.submitLate] permission-denied` was logged through `lib/errors`
  with the redacted payload.

## Not yet done

- Deploying `firestore.rules` (the `splitShareClaims` block). Self-service stays
  inert until then; everything else works without it.
- Creating the new Netlify site and adding the proxy rules plus the
  `workbox.navigateFallbackDenylist` fix to the Vite repo.
