/**
 * One routing and header table for the web export, shared by both hosts:
 *
 * - Netlify (primary): `scripts/build-web.js` writes `netlifyRedirects()` and
 *   `netlifyHeaders()` into dist-web/. Their text must not change by accident;
 *   scripts/webHosting.test.ts pins it byte for byte.
 * - Cloudflare Pages (backup, SPENDLY-621): `scripts/build-cloudflare-pages.js`
 *   copies dist-web/ to dist-cloudflare/ and writes `cloudflareHeaders()` and
 *   `cloudflareRoutes()` instead. The Worker (SPENDLY-703) uses `spaIndexFor()`.
 *
 * Why Cloudflare needs different rules (docs/SPENDLY-621-compatibility.md):
 * Pages drops `/x/* /x/index.html 200` as an infinite loop, a 200 rewrite
 * overrides real files, and `_headers` allows only one `*` per rule. So the
 * SPA fallback moves into the Worker, and the header rules are spelled out per
 * product.
 *
 * Plain CommonJS so build-web.js can require it without a TypeScript loader.
 */

/** The product sub-apps. The landing app is published at the site root. */
const PRODUCT_BASE_PATHS = ['/expense', '/nutrition', '/ganesh'];

/** Content-hashed output folders, cached for a year. */
const IMMUTABLE_DIRS = ['_expo', 'assets'];
const IMMUTABLE_CACHE = 'Cache-Control: public, max-age=31536000, immutable';

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com https://www.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.gstatic.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://*.google.com https://*.supabase.co wss://*.supabase.co",
  "frame-src https://accounts.google.com https://*.firebaseapp.com https://*.google.com",
  "form-action 'self' https://accounts.google.com",
].join('; ');

/** Sent with every page on both hosts. */
const SECURITY_HEADERS = [
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Robots-Tag', 'noindex, nofollow'],
  ['Content-Security-Policy', CSP],
];

function netlifyRedirects() {
  // Catch-all is intentional: this host now serves the full multi-product
  // app (/expense, /nutrition, /ganesh, landing). Narrow share-only
  // redirects in netlify.toml are historical and not what is deployed.
  return [
    '/expense           /expense/index.html     200',
    '/expense/*         /expense/index.html     200',
    '/nutrition         /nutrition/index.html   200',
    '/nutrition/*       /nutrition/index.html   200',
    '/ganesh            /ganesh/index.html      200',
    '/ganesh/*          /ganesh/index.html      200',
    // The old share-link pages this site used to serve exclusively. The
    // "landing" build (published at the site root) still registers these two
    // routes unconditionally (app/_layout.tsx), so they keep working here —
    // listed explicitly rather than relying on the catch-all below.
    '/split/*           /index.html             200',
    '/payment/*         /index.html             200',
    // SPENDLY-522: market quote functions, served by this site (they used to
    // live on the legacy kesavaexpensetracker site). Same origin, so the CSP
    // connect-src stays 'self'. Must stay above the catch-all, which
    // otherwise answers /api/* with HTML.
    '/api/stock         /.netlify/functions/stock         200',
    '/api/mutual-funds  /.netlify/functions/mutual-funds  200',
    '/api/crypto        /.netlify/functions/crypto        200',
    // SPENDLY-558: stock chart history (cached on Netlify's durable CDN).
    '/api/stock-history /.netlify/functions/stock-history 200',
    // SPENDLY-642: Markets tab overview (cached on Netlify's durable CDN).
    '/api/market-overview /.netlify/functions/market-overview 200',
    // SPENDLY-647: stock screener universe (cached on Netlify's durable CDN).
    '/api/screener-universe /.netlify/functions/screener-universe 200',
    // SPENDLY-656: batched watchlist quotes (cached on Netlify's durable CDN).
    '/api/stock-quotes /.netlify/functions/stock-quotes 200',
    '/*                 /index.html             200',
    '',
  ].join('\n');
}

function securityHeaderLines() {
  return SECURITY_HEADERS.map(([name, value]) => `  ${name}: ${value}`);
}

function netlifyHeaders() {
  return [
    '/_expo/*',
    `  ${IMMUTABLE_CACHE}`,
    '/assets/*',
    `  ${IMMUTABLE_CACHE}`,
    '/*/_expo/*',
    `  ${IMMUTABLE_CACHE}`,
    '/*/assets/*',
    `  ${IMMUTABLE_CACHE}`,
    '/*',
    ...securityHeaderLines(),
    '',
  ].join('\n');
}

/** Every content-hashed folder on the site: the root's and each product's. */
function immutablePrefixes() {
  return ['', ...PRODUCT_BASE_PATHS].flatMap((base) => IMMUTABLE_DIRS.map((dir) => `${base}/${dir}/`));
}

/**
 * Pages rejects `/*\/_expo/*` ("only one wildcard"), so each product's folders
 * get their own rule. The security block is the same as Netlify's.
 */
function cloudflareHeaders() {
  return [
    ...immutablePrefixes().flatMap((prefix) => [`${prefix}*`, `  ${IMMUTABLE_CACHE}`]),
    '/*',
    ...securityHeaderLines(),
    '',
  ].join('\n');
}

/**
 * Which requests run the Worker. Everything does, except the content-hashed
 * folders: bundles and images are served straight from the static files and
 * never count against the Workers free quota. The Worker serves the static
 * file for any other path too, so this list only saves invocations; it is not
 * needed for correctness.
 */
function cloudflareRoutes() {
  return {
    version: 1,
    include: ['/*'],
    exclude: immutablePrefixes().map((prefix) => `${prefix}*`),
  };
}

/** Paths that belong to the serverless functions, never to a page. */
function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/') || pathname.startsWith('/.netlify/');
}

/**
 * The page a missing path falls back to, the way Netlify's `_redirects` does:
 * a product's sub-paths get that product's app, anything else the landing app
 * (which also serves the /split and /payment share links).
 *
 * Returns null when there must be no fallback:
 * - API paths, which must never be answered with the app's HTML;
 * - paths whose last segment has a file extension, so a missing bundle or
 *   image stays a 404 instead of becoming HTML.
 */
function spaIndexFor(pathname) {
  if (isApiPath(pathname)) return null;
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (last.includes('.')) return null;
  const base = PRODUCT_BASE_PATHS.find((p) => pathname === p || pathname.startsWith(`${p}/`));
  return `${base ?? ''}/`;
}

module.exports = {
  PRODUCT_BASE_PATHS,
  CSP,
  SECURITY_HEADERS,
  netlifyRedirects,
  netlifyHeaders,
  cloudflareHeaders,
  cloudflareRoutes,
  isApiPath,
  spaIndexFor,
};
