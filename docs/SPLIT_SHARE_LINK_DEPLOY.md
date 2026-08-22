# Deploying the public split share pages

The public pages (`/split/:slug`, `/payment/:slug`) are the Expo **web** export
of this repo. Everything in this repo is already wired for it; what remains is
one new Netlify site and three edits in the sibling Vite repo.

Read `docs/audits/SPLIT_SHARE_LINK_AUDIT_2026-08-22.md` first if you want the
reasoning. This file is just the runbook.

## Why a second site instead of the obvious thing

`kesavaexpensetracker.netlify.app` serves the **Vite** web app from
`C:\dev\expense-tracker`, and this mobile app depends on two things that live
there:

- `/api/*` → Netlify functions backing `services/marketDataService.ts`
- `/mobile-google-auth` → the Google sign-in bridge in `lib/googleAuthBridge.ts`

Deploying the Expo export over that site would take both with it. So the Expo
export goes to its own site, and `/split/*` is **proxied** in at status 200 from
the original origin. That keeps `EXPO_PUBLIC_APP_URL` correct for all three of
its consumers, means links already sent keep working, and needs **no APK
rebuild**.

`/payment/*` is deliberately **not** proxied: that route is already public on
the Vite app (`src/App.tsx` mounts `PaymentRequestPage` outside the auth-gated
tree) and works today.

---

## Step 1 — Deploy the Firestore rules

Do this first. Self-service updates from the public page stay inert until the
`splitShareClaims` block is live; everything else works without it.

```bash
npx firebase deploy --only firestore:rules --project expenseapp-27f94 --dry-run
```

```bash
npx firebase deploy --only firestore:rules --project expenseapp-27f94
```

The dry run has already been verified to compile against the live project. See
`docs/FIREBASE_RULES_DEPLOY.md` for why this repo owns the rules and why the
Vite repo's copy must not be deployed over them.

## Step 2 — Create the Netlify site for this repo

Netlify → Add new site → Import an existing project → GitHub → this repo.

- **Site name:** `spendly-share` (whatever you pick, the exact subdomain goes
  into Step 4 — the snippets below assume `spendly-share.netlify.app`)
- **Build settings:** leave blank. `netlify.toml` in this repo overrides the UI.
- **Production branch:** `main`. Turn **branch deploys off** — each one is a
  fresh ~14 MB bundle.
- **The new site must be in the same Netlify team as the existing one.** Netlify
  blocks cross-team site-to-site proxying, and Step 4 is a proxy.

**Environment variables** (scope: all, every deploy context) — exactly these:

| Key | Value |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | same as the Android build |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | same |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | same |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | same |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER` | same |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | same |
| `EXPO_PUBLIC_APP_URL` | `https://kesavaexpensetracker.netlify.app` |

Do **not** set `EXPO_PUBLIC_GEMINI_API_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
`EXPO_PUBLIC_MARKET_API_URL`, or any `MYAPP_RELEASE_*`. They are inlined into a
public bundle and the share pages never use them.

> Missing Firebase vars is the most likely "it deployed but shows nothing"
> failure: `isFirebaseEnvConfigured()` returns false, `getFirestoreDb()` returns
> null, and the page renders "Splits aren't configured on this device."

Then verify the site directly, before any proxying:

```bash
curl -s https://spendly-share.netlify.app/split/qccgraks87 | grep -o '_expo/static/js/web/[^"]*'
```

## Step 3 — Service worker fix in the Vite repo (mandatory, do before Step 4)

`C:\dev\expense-tracker\vite.config.ts` uses `VitePWA({ registerType: 'autoUpdate' })`
and its `workbox` block does not set `navigateFallback`, so `vite-plugin-pwa`
defaults it to `index.html`. **For anyone who has ever loaded that site, the
service worker serves the cached Vite shell for `/split/:slug` and the Netlify
proxy never runs.**

In the `workbox: { ... }` object (around line 375), add:

```ts
        // /split/* and the Expo bundles are proxied to the Expo web build at
        // the Netlify edge. Without this the SW's navigateFallback serves this
        // SPA's cached shell and the proxy is never reached.
        navigateFallbackDenylist: [/^\/split\//, /^\/_expo\//],
```

Ship and let it propagate **before** Step 4. Because `registerType` is
`autoUpdate`, the new SW installs on a visitor's next load and takes over the
load after that — so an existing user's first hit on `/split/x` may still show
the Vite page, and a reload fixes it permanently. Confirming exactly that
behaviour is how you know the denylist landed.

## Step 4 — Proxy rules in the Vite repo

In `C:\dev\expense-tracker\netlify.toml`, insert **after** the
`/api/twelve-data/*` block and **before** the `from = "/*"` catch-all (currently
line 57). Order is load-bearing: Netlify takes the first match top to bottom, so
anything below the catch-all never fires.

```toml
# ---------------------------------------------------------------------------
# Public split pages are served by the Expo web build (mobile repo), proxied in
# at status 200 so links already shared keep this origin.
#
# /split/:id in src/App.tsx is inside AppContent (auth-gated) and reads the
# private `splits` collection, so a recipient without an account lands on the
# login page. The Expo page reads the world-readable `splitPublicShares`
# snapshot instead.
#
# ORDER MATTERS: these must stay above the `/*  ->  /index.html` catch-all.
# /payment/:slug is deliberately NOT proxied — it is already a public route in
# this app (outside AppContent) and works today.
# ---------------------------------------------------------------------------

[[redirects]]
  from = "/split/*"
  to = "https://spendly-share.netlify.app/split/:splat"
  status = 200
  force = true

# Expo's JS bundles. The proxied index.html references these as absolute paths,
# so the browser requests them from THIS origin. The /_expo prefix is
# Expo-specific and cannot collide with anything Vite emits.
[[redirects]]
  from = "/_expo/*"
  to = "https://spendly-share.netlify.app/_expo/:splat"
  status = 200
  force = true

# Metro assets. Verified against a real export: dist/assets/ contains exactly
# two subtrees, so these two rules cover it without shadowing Vite's own
# /assets/<name>-<hash>.js build output.
[[redirects]]
  from = "/assets/assets/*"
  to = "https://spendly-share.netlify.app/assets/assets/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/assets/node_modules/*"
  to = "https://spendly-share.netlify.app/assets/node_modules/:splat"
  status = 200
  force = true
```

Netlify constraints, all relevant here: Netlify→Netlify proxying is one hop
only, must target the `*.netlify.app` subdomain rather than a custom domain, and
cannot cross teams.

## Step 5 — Verify

Proxy serves the Expo shell, not the Vite one:

```bash
curl -s https://kesavaexpensetracker.netlify.app/split/qccgraks87 | grep -o '_expo/static/js/web/[^"]*'
```

Open the same URL in a **fresh incognito window** (no service worker) and
confirm the split renders with participants. In your normal browser expect the
Vite login page once, then the split page after a reload — that is the SW
handover from Step 3.

Then confirm nothing else broke:

```bash
curl -s "https://kesavaexpensetracker.netlify.app/api/stock?symbol=RELIANCE" | head -c 120
```

```bash
curl -sI https://kesavaexpensetracker.netlify.app/mobile-google-auth
```

Also spot-check `/payment/<a-real-payment-slug>` and `/` on that origin — both
should be unchanged.

## Local development

The web export can be exercised without deploying anything:

```bash
npm run build:web
```

`npx expo serve` will **not** work for this — it has no SPA fallback and 404s on
`/split/abc`. Use anything with a single-page fallback, e.g.:

```bash
npx netlify-cli dev --dir dist
```

Get a real slug from Firebase Console → Firestore → `splitPublicShares` → any
document's `slug` field.

## Notes

- Entry bundle is ~1.4 MB gzipped, because expo-router's default `sync` import
  mode pulls every route into the entry chunk (the largest single contributor is
  `lucide-react-native`, whose web entry is a barrel over ~1,700 icon modules
  that Metro does not tree-shake). Acceptable for a page nobody visits twice. If
  it ever matters, try `asyncRoutes: { "web": "production" }` in the
  `expo-router` plugin options — it is alpha and web-only, so revert if the
  export misbehaves.
- Firebase **authorized domains** need no change for the share pages: they make
  no auth call, and Firestore authenticates with the API key and project id, not
  the origin. Add the new domain only if you intend to sign in on it directly —
  note the SPA fallback means the new site's `/` is a full copy of the app, which
  is why `netlify.toml` here 302s that root back to the main site.
