# SPENDLY-702 — Static site and routing for Cloudflare Pages

Part of epic [SPENDLY-621](SPENDLY-621-cloudflare-web-backup.md). Follows the
routing results in [SPENDLY-621-compatibility.md](SPENDLY-621-compatibility.md)
(variant C).

## What changed
- **`scripts/lib/webHosting.js`** is the one table for both hosts:
  - the products, the CSP and the security headers;
  - Netlify's `_redirects`/`_headers` text, moved here verbatim;
  - the Cloudflare `_headers`, `_routes.json` and the SPA fallback rule
    `spaIndexFor()`.

  It's plain CommonJS so `build-web.js` can require it.
- **`scripts/build-web.js`** writes the Netlify files from that table. The output
  is **byte-identical** to before: compared against bytes captured before the
  change, and pinned by a test.
- **`scripts/build-cloudflare-pages.js`** (`npm run build:cloudflare-pages`)
  copies `dist-web/` to `dist-cloudflare/`. It then:
  - drops Netlify's `_redirects` (its SPA rules loop or shadow real files on
    Pages, and its `/api` lines point at Netlify);
  - writes `_headers` with one rule per product folder (Pages allows one `*` per
    rule);
  - writes `_routes.json`, so every request except the content-hashed `_expo/`
    and `assets/` folders reaches the Worker.

  It refuses an incomplete export and never modifies `dist-web/`.
- **`.gitignore`:** `dist-cloudflare/`.

## How a request is served on the backup
| Request | Served by |
|---|---|
| `/expense/_expo/…`, `/assets/…` and the other content-hashed folders | Static files only (excluded in `_routes.json`); cached a year |
| An existing file (`/expense/manifest.webmanifest`, icons, `/`) | The Worker passes it to the static files |
| A missing path without a file extension (`/expense/dashboard`, `/split/abc`) | The Worker serves `spaIndexFor(path)`: that product's `index.html`, else the root's, with **200** |
| A missing file (`…/missing.js`) | 404 |
| `/api/*`, `/.netlify/*` | The Worker's function routing (SPENDLY-703); never HTML |

The Worker itself is SPENDLY-703. Until then, `dist-cloudflare/` serves files,
but deep links aren't handled yet.

## Tests
- `scripts/webHosting.test.ts`:
  - the Netlify text is byte-identical;
  - every Cloudflare header rule has at most one `*`;
  - each product's folders are immutable, and the security block equals
    Netlify's;
  - `_routes.json` excludes no API path and stays within 100 rules;
  - `spaIndexFor` for product, share, root and partial-prefix paths, plus API
    paths and missing files returning `null`;
  - the build copies, drops `_redirects`, leaves `dist-web/` untouched and
    refuses an incomplete export.
- **Local Pages run:**
  - `dist-cloudflare/` built from a real web export, plus a throwaway Worker
    using `spaIndexFor`, under `wrangler pages dev`.
  - Deep links in all three products and the share routes return 200 with the
    right app; bundles are served with the immutable header.
  - Missing files return 404, the CSP is on every page, and API paths reach the
    Worker.
  - Pages printed no rule warnings.

## Not changed
- `web-deploy.yml`
- the Netlify functions
- the app code
