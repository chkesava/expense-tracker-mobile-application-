# SPENDLY-621 — Cloudflare compatibility matrix (SPENDLY-701)

Tested 2026-11-06 on `main` 363e4e6a. Everything below was **run locally**; nothing
was deployed and no production data was read or written.

## How it was tested

- **Workers runtime.** I used wrangler 4.158 (`wrangler dev`, which runs Cloudflare's
  workerd locally), `compatibility_date = 2026-10-01` and `nodejs_compat`. Wrangler was
  installed in a scratch folder, not in the repo.
- **One trial Worker.** It imported all 14 handlers from `netlify/functions/*.ts`
  **unchanged**, through a small Request → Netlify-event adapter. It counted every
  outbound `fetch`.
- **Firebase.** A private Firestore + Auth emulator (project `demo-spendly`) ran on
  separate ports. Supabase was a local mock that answers like a healthy project.
  The "real Google" paths used a **throwaway service-account key** that belongs to no
  project, so Google could only refuse it.
- **Routing.** `wrangler pages dev` served a copy of the existing `dist-web` (same
  layout as today's build) with four candidate rule sets.
- **CPU time.** Cloudflare's free-plan limit (10 ms) counts CPU only, not network
  waits, and local workerd doesn't measure it. So handler CPU was measured in Node
  with the upstream responses recorded once and replayed. Each run loaded a fresh
  copy of the code, so the numbers are **upper bounds**. They must be confirmed on
  a real deploy (SPENDLY-706).

## Free-plan limits used
| Limit | Free plan |
|---|---|
| CPU per request | 10 ms |
| Outbound calls (subrequests) per request | 50 |
| Worker size | 3 MB gzipped |
| Worker requests | 100,000 / day (static files don't count) |

## Results per function

| Function | Runs unchanged on Workers? | Calls / request | CPU (upper bound) | Free-plan verdict |
|---|---|---|---|---|
| stock | **Yes**, live data | 1 | 2.3 ms | **Go** |
| mutual-funds | **Yes** | 1 | 3.1 ms | **Go** |
| crypto | **Yes** | 1 | 2.4 ms | **Go** |
| stock-history | **Yes** | 1 | 6.3 ms | **Go** |
| stock-quotes (10 symbols) | **Yes** | 1–2 | 7.8 ms | **Go** (50 symbols: check on deploy) |
| market-overview | **Yes** | 6 | 16.4 ms | **At risk.** Over 10 ms when uncached. Cached 15 min (S3), so only cache misses risk failing. Confirm on deploy, otherwise not covered. |
| screener-universe | **Yes** | 25 | **206 ms** (parses 2.2 MB) | **Not covered on Free.** About 20× the CPU limit on every uncached call. |
| nutrition-ai | **Yes** (Auth works; Gemini reached) | 2 | n/m | **Go.** The ID-token check and one Gemini call are small. |
| readmodel-claims | **Yes**: emulator `{"changed":true}`, bad token → 401 | 2–3 | n/m | **Go** |
| readmodel-push | **No.** Firestore fails (see blocker 3) | 6 (1 doc) | n/m | **Rewrite** the Firestore reads. `mode:"user"` reads 53 tables, which exceeds 50 calls, so it's **not covered**; the nightly sync already catches up. |
| ganesh-summary | **No.** Firestore | 11–12 | n/m | **Rewrite.** Calls stay small, but each read returns a whole subcollection, so CPU grows with festival size. Confirm on deploy. |
| ganesh-draw | **No.** Firestore | 7 | n/m | **Rewrite** (transaction + query) |
| epf-cron | **No.** Firestore | 1 + 3 per establishment + commits | n/m | **Rewrite.** Send `limit` ≤ 10 (the body already accepts it) to stay under 50 calls. |
| delete-account | **No.** Firestore | per page: 1 query + ~10 deletes | n/m | **Rewrite** plus a **per-call budget**. Today it loops for 7 s, which is many more than 50 calls. |

n/m = not meaningful in Node. These ran through firebase-admin's Firestore layer,
which the Workers version won't use.

### Blockers found
1. **`__dirname is not defined`** (google-gax, pulled in by `firebase-admin/firestore`).
   It crashes the **whole** Worker at startup, the market functions included. Fixed in
   the trial by defining `__dirname`/`__filename` at build time.
2. **`module is not defined`.** `scripts/readmodel-sync.ts` ends with
   `if (require.main === module)`, and readmodel-push imports it. **Required change:**
   guard it with `typeof module !== "undefined"`. It's one line and harmless in Node.
3. **Firestore Admin can't run on Workers.** `@google-cloud/firestore` (even with
   `FIRESTORE_PREFER_REST=true`) encodes requests with protobufjs, which generates code
   with `new Function`. Workers forbid that: `EvalError: Code generation from strings
   disallowed for this context`. It isn't configurable. Every Firestore call in
   ganesh-summary, ganesh-draw, epf-cron, delete-account and readmodel-push fails.
4. **One bundle, one blast radius.** Blocker 1 broke all 14 functions at once. The
   Worker must load each handler lazily (dynamic `import()` per route), so a failing
   module only breaks its own route.

### What works as-is
- **Size:** all 14 handlers plus firebase-admin bundle to **1.09 MB gzipped** (6.5 MB
  raw), under the 3 MB limit.
- **Firebase Auth admin** works under `nodejs_compat` (it uses the Node `http` client,
  which Workers implement over `fetch`). Tested:
  - `verifyIdToken` against the emulator;
  - against **Google's real keys**: the throwaway token was fetched, checked and
    rejected with "invalid signature";
  - `getUser` / `setCustomUserClaims` against the emulator;
  - **minting a service-account access token** against `oauth2.googleapis.com`: Google
    parsed the signed JWT and answered "invalid_grant: account not found".
- `node:crypto` (`randomInt`, `createHash`, `timingSafeEqual`) and `Buffer` loaded fine.
- **Market functions:** same JSON as on Netlify, 404 JSON for an unknown ticker, live
  Yahoo / mfapi / CoinGecko from this machine. Whether Yahoo throttles Cloudflare's
  egress addresses can only be seen after a deploy.

## Routing (Cloudflare Pages)

| Variant | Deep links (`/expense/dashboard`) | Real files (`/expense/_expo/…js`) | Missing files | Verdict |
|---|---|---|---|---|
| A — Netlify `_redirects` as-is | **404.** Pages drops all 6 `…/index.html` rules as "infinite loop" | OK | 404 | ✗ |
| B — rewrite to the directory (`/expense/* /expense/ 200`) | 200, right product | **Served as HTML.** On Pages a 200 rewrite overrides real files | HTML | ✗ |
| **C — Worker fallback** | **200, right product** | **OK** | **404** | **✓ chosen** |
| D — each product's `404.html` = its `index.html` | Right product, but **status 404** | OK | 404 | ✗ fallback only |

**Variant C:**
- `_routes.json` includes `/*` and excludes the 8 `_expo/` and `assets/` folders, so
  bundles and images never reach the Worker.
- The Worker serves the static file. If it's missing **and the path has no file
  extension**, it serves `index.html` for `/expense`, `/nutrition` or `/ganesh` (else
  the root), with status 200.
- `/api/*` and `/.netlify/functions/*` always reach the Worker, so **an API path never
  returns the SPA's HTML**.

**Headers:**
- Pages applies `_headers` (CSP, HSTS, `X-Frame-Options`, `X-Robots-Tag`, nosniff,
  referrer policy) to the HTML the Worker returns from the static files. The
  `immutable` cache header lands on `_expo/` files.
- `/*/_expo/*` and `/*/assets/*` are **rejected** by Pages ("only one wildcard"). They
  must be spelled out per product (`/expense/_expo/*`, …).
- `_headers` is **not** applied to responses the Worker builds itself (the APIs). The
  Worker must add the security headers there.

**Behaviour that differs from Netlify** (acceptable, but documented):
- `/expense` (no slash) → **308** to `/expense/`. Netlify answers 200.
- `/home.html` → 308 `/home` (Pages' pretty URLs). Nothing in the app links to it;
  only the historical `netlify.toml` and docs mention it.
- Netlify's durable CDN cache (`Netlify-CDN-Cache-Control`, `Netlify-Vary`) is ignored
  by Cloudflare. S3 rebuilds it with the Cache API. That also keeps market-overview
  and stock-quotes misses rare.

## Owner decision D5 (2026-11-06, after this test)
**The backup only runs what works on Cloudflare as it is; nothing is rewritten for
it.** This replaces the S3/S4 plan below.

| On the backup | Functions |
|---|---|
| **Served** | stock, mutual-funds, crypto, stock-history, stock-quotes, market-overview, nutrition-ai, readmodel-claims |
| **Not served** (JSON 503 "not available on the backup") | ganesh-summary, ganesh-draw, epf-cron, delete-account, readmodel-push, screener-universe |

- S4 (SPENDLY-704) is won't-do.
- The Worker imports only `firebase-admin/app` and `firebase-admin/auth`, never
  `firebase-admin/firestore`. That leaves out google-gax and `scripts/readmodel-sync.ts`,
  so blockers 1 and 2 don't arise.
- **Effect on users of the backup:**
  - Ganesh festival totals and the Token Laddu draw can't be run.
  - Account deletion waits for Netlify.
  - The monthly EPF job stays on Netlify only.
  - Saves reach the read model by the nightly sync instead of the per-save push.
  - The stock screener shows its "unavailable" state.

## What this test meant for the next stories (before D5)
- **S2 (SPENDLY-702):** routing variant C. Spell out per-product header rules; no
  `/api` lines in `_redirects`; `_routes.json` as above.
- **S3 (SPENDLY-703):**
  - lazy per-route handler loading;
  - build-time `__dirname` / `__filename` defines;
  - security headers on Worker responses;
  - Cache API for the `Netlify-CDN-Cache-Control` handlers.
  - The 7 market functions, nutrition-ai and readmodel-claims run **unchanged**
    (claims moves from S4 to S3).
- **S4 (SPENDLY-704):** a **Firestore REST port** for the subset the 5 functions use:
  - document get / `batchGet`;
  - `runQuery`, including collection-group, `select`, `orderBy`, `startAfter` and
    `limit`;
  - `listCollectionIds`;
  - `beginTransaction` / `commit` with preconditions, creates, merges, deletes and
    `serverTimestamp` / `arrayRemove` transforms;
  - an access token from the service account (the minting path already works).

  It is injected where the handlers take a Firestore instance; Netlify keeps
  firebase-admin. Also:
  - the `readmodel-sync.ts` guard;
  - a delete-account call budget;
  - the backup's epf-cron caller sends `limit ≤ 10`.
- **Not covered on the Free plan:**
  - **screener-universe:** the Markets screener shows its existing "unavailable"
    state on the backup;
  - **readmodel-push `mode:"user"`:** the nightly sync catches up;
  - **market-overview:** possibly; confirm on deploy.
- **Confirm on the first real deploy (S6):**
  - real CPU per function (Workers metrics);
  - Yahoo from Cloudflare's addresses;
  - ganesh-summary on a large festival.

## Found on the way (not Cloudflare)
On 2026-11-06 at about 22:25, removing the `spendly-678` worktree deleted part of
`C:\dev\expense\node_modules` through that worktree's junction. That's 235 of 1187
packages, alphabetically up to `@google-cloud/firestore`. The 621 worktree now has
its own `node_modules`. The main checkout's install still needs `npm ci`; the owner
decides when, since other sessions use it.
