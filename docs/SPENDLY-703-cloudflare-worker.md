# SPENDLY-703 — Worker, request adapter and the functions that run on Cloudflare

Part of epic [SPENDLY-621](SPENDLY-621-cloudflare-web-backup.md). Scope from
SPENDLY-701 and decision **D5**: the backup runs only the functions that work on
Cloudflare unchanged.

## What the backup serves
| Path | On the backup |
|---|---|
| `/api/stock`, `/api/mutual-funds`, `/api/crypto`, `/api/stock-history`, `/api/market-overview`, `/api/stock-quotes` (and the same names under `/.netlify/functions/`) | Same handlers as Netlify, unchanged |
| `/.netlify/functions/nutrition-ai`, `/.netlify/functions/readmodel-claims` | Same handlers as Netlify, unchanged |
| `/.netlify/functions/{ganesh-summary, ganesh-draw, epf-cron, delete-account, readmodel-push}`, `/api/screener-universe` | **JSON 503** `BACKUP_UNAVAILABLE`, "This feature isn't available on the backup site." (as `error` and `message`, so every client shows it) |
| Any other `/api/*` or `/.netlify/*` | JSON 404, never the app's HTML |
| Pages and files | Static files; a missing extensionless path gets its product's `index.html` with a 200 (`spaIndexFor`, SPENDLY-702) |

## Files
- **`cloudflare/worker.ts`:** the `_worker.js` entry. It has only a default
  export, because Workers treat every named export of the entry module as
  another entry point and refuse to start.
- **`cloudflare/router.ts`:**
  - function routing, the 503/404 answers and the SPA fallback;
  - security headers on function answers (`_headers` only covers static files);
  - each handler imported on its first request, so one bad module can't take
    the rest down;
  - a failed import is retried on the next request.
- **`cloudflare/netlifyAdapter.ts`:** Request → Netlify v1 event (method,
  lowercased headers, query, body) and `{ statusCode, headers, body }` →
  Response.
- **`cloudflare/edgeCache.ts`:** Netlify's durable CDN cache, rebuilt on the Cache API:
  - `Netlify-CDN-Cache-Control` `s-maxage` / `stale-while-revalidate`;
  - `Netlify-Vary` query keys, so junk parameters can't bypass the cache;
  - `If-None-Match` → 304 from the stored ETag.

  It keeps market-overview's Yahoo calls and CPU to one per 15 minutes per data
  centre.
- **`cloudflare/functions.ts`:** which functions are served, and which are
  Netlify-only with the reason.
- **`cloudflare/wrangler.toml`:** the Pages project config
  (`pages_build_output_dir = ../dist-cloudflare`, `nodejs_compat`).
- **`cloudflare/worker.wrangler.toml`:** bundling only.
- **`scripts/build-cloudflare-worker.js`** (`npm run build:cloudflare-worker`):
  - bundles the Worker with wrangler's own bundler into
    `dist-cloudflare/_worker.js`;
  - fails over the Free 3 MB gzip limit (current bundle: 1.40 MB, **0.27 MB
    gzipped**; Firestore isn't in it).
- **`scripts/lib/webHosting.js`:** adds `API_FUNCTIONS`, the names routed under
  `/api`. `webHosting.d.ts` types it for TypeScript.

**Wrangler isn't a devDependency.** It's pinned (`wrangler@4.158.0`) and run
with npx, because it downloads the ~100 MB workerd runtime that every `npm ci`
would otherwise pay for. This differs from the Jira text.

**Deploying:**
- Pages bundles `_worker.js` again at deploy time. Keep its bundling on (no
  `--no-bundle`): our bundle imports Node built-ins by bare name (`fs`,
  `https`), which Pages' no-bundle check rejects.
- Re-bundling with `nodejs_compat` resolves them.

## Tests
| File | Covers |
|---|---|
| `cloudflare/netlifyAdapter.test.ts` | event and response conversion |
| `cloudflare/edgeCache.test.ts` | policy parsing, keys, fresh/stale, negative answers, no-store, 304, header clean-up |
| `cloudflare/router.test.ts` | both paths reach the same handler; 503s (and their preflight) never call a handler; API 404s never read static files; 500 on a crash; a failed import retried; the SPA fallback; the cache (HIT/MISS/STALE + background refresh/BYPASS, ETag) |
| `cloudflare/functions.test.ts` | every function in `bundle-netlify-fns.js` is served or Netlify-only, exactly once; no served function imports `firebase-admin/firestore`; the `/api` names match Netlify's `_redirects` |

**Local run** (`wrangler pages dev`, the real bundled Worker, a real web export,
a throwaway service-account key, no emulator):
- **Pages:** all deep links 200 with the right app; files served; missing files
  404; CSP everywhere.
- **Market functions:** live data, with cache MISS then HIT, also with a junk
  parameter.
- **Auth:** nutrition-ai and readmodel-claims returned 401 for a bad token through
  Google's real key check.
- **Not served:** the 5 Netlify-only functions and the screener returned 503
  JSON; unknown APIs 404 JSON.

## Not changed
- the Netlify functions
- `web-deploy.yml`
- the app code

## Next
SPENDLY-705: the manual backup workflow and the smoke script.
