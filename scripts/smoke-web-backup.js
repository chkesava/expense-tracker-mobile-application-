/**
 * SPENDLY-705: smoke test for a deployed web host.
 *
 *   node scripts/smoke-web-backup.js https://spendly-web-backup.pages.dev --mode=backup
 *   node scripts/smoke-web-backup.js https://spendly-share.netlify.app --mode=netlify
 *
 * It checks every product page, deep links, the share routes, manifests and
 * PWA icons, a content-hashed bundle, the security headers, and every function
 * path. It never changes data: pages and market APIs are plain GETs, and the
 * signed-in functions only get an OPTIONS and a POST **without** credentials,
 * which every handler rejects before doing anything.
 *
 * --mode=backup (Cloudflare, decision D5) also expects:
 * - the Netlify-only functions to answer JSON 503 `BACKUP_UNAVAILABLE`;
 * - an unknown API path and a missing bundle file to be 404s.
 *
 * Netlify answers those two with the app's HTML (its `/*` rewrite), so
 * --mode=netlify skips them.
 *
 * Market APIs depend on Yahoo / mfapi / CoinGecko: a non-200 JSON answer is a
 * warning, an HTML answer a failure. Exit code 1 on any failure.
 */
const { PRODUCT_BASE_PATHS } = require('./lib/webHosting');

/** Market functions the backup serves, with a harmless query. Kept in step with cloudflare/functions.ts by its test. */
const MARKET_PROBES = {
  stock: '?symbol=HDFCBANK.NS',
  'mutual-funds': '?schemeCode=120503',
  crypto: '?ids=bitcoin',
  'stock-history': '?symbol=TCS.NS&range=1M',
  'market-overview': '',
  'stock-quotes': '?symbols=TCS.NS,INFY.NS',
};
const SIGNED_IN_FUNCTIONS = ['nutrition-ai', 'readmodel-claims'];
const NETLIFY_ONLY_POST = ['ganesh-summary', 'ganesh-draw', 'epf-cron', 'delete-account', 'readmodel-push'];
const NETLIFY_ONLY_GET = ['screener-universe'];

const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');
const isJson = (res) => (res.headers.get('content-type') || '').includes('application/json');

function check(name, path, init, verify) {
  return { name, path, init, verify };
}

/** A page: 200 HTML that boots the app at `base` (its bundle path proves which app it is). */
function page(name, path, base) {
  return check(name, path, undefined, (res, body) => {
    if (res.status !== 200) return `expected 200, got ${res.status}`;
    if (!isHtml(res)) return `expected HTML, got ${res.headers.get('content-type')}`;
    if (!body.includes(`${base}/_expo/`)) return `not the ${base || 'root'} app (no ${base}/_expo/ bundle)`;
    return null;
  });
}

function smokeChecks(mode) {
  const checks = [];
  const apps = [['', 'root'], ...PRODUCT_BASE_PATHS.map((p) => [p, p.slice(1)])];

  for (const [base, label] of apps) {
    checks.push(page(`${label} app`, `${base}/`, base));
    if (base) checks.push(page(`${label} deep link`, `${base}/smoke/deep/link`, base));
    checks.push(
      check(`${label} manifest`, `${base}/manifest.webmanifest`, undefined, (res, body) => {
        if (res.status !== 200) return `expected 200, got ${res.status}`;
        try {
          const manifest = JSON.parse(body);
          return manifest.start_url === `${base}/` ? null : `start_url is ${manifest.start_url}`;
        } catch {
          return 'not JSON';
        }
      }),
      check(`${label} PWA icon`, `${base}/pwa-192.png`, undefined, (res) =>
        res.status === 200 && (res.headers.get('content-type') || '').startsWith('image/png') ? null : `expected 200 image/png, got ${res.status} ${res.headers.get('content-type')}`
      )
    );
  }
  checks.push(page('split share link', '/split/smoke-check', ''), page('payment share link', '/payment/smoke-check', ''));

  checks.push(
    check('security headers', '/', undefined, (res) => {
      const missing = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'strict-transport-security', 'x-robots-tag'].filter(
        (name) => !res.headers.get(name)
      );
      return missing.length ? `missing ${missing.join(', ')}` : null;
    }),
    // The bundle path comes from the expense app's HTML; see runSmoke.
    check('content-hashed bundle', '/expense/', undefined, null),
    // SPENDLY-750: ensure the Inter font asset is present, served as font, and immutable.
    check('inter font asset', '/expense/', undefined, null)
  );

  for (const [name, query] of Object.entries(MARKET_PROBES)) {
    checks.push(
      check(`/api/${name}`, `/api/${name}${query}`, undefined, (res) => {
        if (isHtml(res) || !isJson(res)) return `expected JSON, got ${res.status} ${res.headers.get('content-type')}`;
        return res.status === 200 ? null : { warn: `JSON ${res.status} (upstream market data?)` };
      })
    );
  }

  for (const name of SIGNED_IN_FUNCTIONS) {
    checks.push(
      check(`${name} preflight`, `/.netlify/functions/${name}`, { method: 'OPTIONS' }, (res) =>
        res.status === 204 ? null : `expected 204, got ${res.status}`
      ),
      check(`${name} without sign-in`, `/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, (res) =>
        res.status === 401 && isJson(res) ? null : `expected JSON 401, got ${res.status} ${res.headers.get('content-type')}`
      )
    );
  }

  const netlifyOnly = [
    ...NETLIFY_ONLY_POST.map((name) => [name, `/.netlify/functions/${name}`, 'POST']),
    ...NETLIFY_ONLY_GET.map((name) => [name, `/api/${name}`, 'GET']),
  ];
  for (const [name, path, method] of netlifyOnly) {
    const init = method === 'POST' ? { method, headers: { 'Content-Type': 'application/json' }, body: '{}' } : undefined;
    checks.push(
      check(`${name} (${mode === 'backup' ? 'not on the backup' : 'no credentials'})`, path, init, (res, body) => {
        if (isHtml(res) || !isJson(res)) return `expected JSON, got ${res.status} ${res.headers.get('content-type')}`;
        if (mode !== 'backup') return null;
        if (res.status !== 503) return `expected 503, got ${res.status}`;
        return body.includes('BACKUP_UNAVAILABLE') ? null : 'no BACKUP_UNAVAILABLE code';
      })
    );
  }

  if (mode === 'backup') {
    checks.push(
      check('unknown API path', '/api/smoke-unknown', undefined, (res) =>
        res.status === 404 && isJson(res) ? null : `expected JSON 404, got ${res.status} ${res.headers.get('content-type')}`
      ),
      check('missing bundle file', '/expense/_expo/smoke-missing.js', undefined, (res) =>
        res.status === 404 ? null : `expected 404, got ${res.status}`
      ),
      // The Worker's own code is server-side; Pages must never serve it.
      check('Worker code not served', '/_worker.js', undefined, (res) =>
        res.status === 404 ? null : `expected 404, got ${res.status}`
      )
    );
  }
  return checks;
}

async function runCheck(origin, c, fetchImpl) {
  const res = await fetchImpl(origin + c.path, { redirect: 'manual', ...c.init });
  const body = await res.text();
  if (c.name === 'content-hashed bundle') {
    const bundle = /\/expense\/_expo\/static\/js\/web\/[^"']+\.js/.exec(body);
    if (!bundle) return 'no bundle link in /expense/';
    const js = await fetchImpl(origin + bundle[0]);
    await js.text();
    if (js.status !== 200) return `bundle ${bundle[0]}: ${js.status}`;
    return (js.headers.get('cache-control') || '').includes('immutable') ? null : 'bundle is not cached as immutable';
  }
  if (c.name === 'inter font asset') {
    const bundle = /\/expense\/_expo\/static\/js\/web\/[^"']+\.js/.exec(body);
    if (!bundle) return 'no bundle link in /expense/';
    const js = await fetchImpl(origin + bundle[0]);
    const jsText = await js.text();
    if (js.status !== 200) return `bundle ${bundle[0]}: ${js.status}`;
    const font = /\/expense\/assets\/[^"'\s`]+\/Inter_400Regular\.[a-f0-9]+\.ttf/.exec(jsText);
    if (!font) return 'no Inter_400Regular font link in expense bundle';
    const fontRes = await fetchImpl(origin + font[0]);
    if (fontRes.status !== 200) return `font ${font[0]}: ${fontRes.status}`;
    const ct = fontRes.headers.get('content-type') || '';
    if (ct.includes('text/html')) return `font ${font[0]}: expected font MIME type, got ${ct}`;
    return (fontRes.headers.get('cache-control') || '').includes('immutable')
      ? null
      : `font ${font[0]}: not cached as immutable`;
  }
  return c.verify(res, body);
}

/** Waits for a fresh deployment to answer at all (propagation takes a few seconds). */
async function waitForSite(origin, fetchImpl, { attempts = 12, delayMs = 5000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(`${origin}/`, { redirect: 'manual' });
      if (res.status === 200) return true;
    } catch {
      // not up yet
    }
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

async function runSmoke(origin, { mode = 'backup', fetchImpl = fetch, log = console.log, wait = {} } = {}) {
  const base = origin.replace(/\/+$/, '');
  if (!(await waitForSite(base, fetchImpl, wait))) {
    log(`FAIL  ${base}/ never answered 200`);
    return { failures: 1, warnings: 0 };
  }
  let failures = 0;
  let warnings = 0;
  for (const c of smokeChecks(mode)) {
    let outcome;
    try {
      outcome = await runCheck(base, c, fetchImpl);
    } catch (error) {
      outcome = `request failed: ${error instanceof Error ? error.message : error}`;
    }
    if (outcome === null) log(`PASS  ${c.name}`);
    else if (typeof outcome === 'object') {
      warnings += 1;
      log(`WARN  ${c.name}: ${outcome.warn}`);
    } else {
      failures += 1;
      log(`FAIL  ${c.name} (${c.path}): ${outcome}`);
    }
  }
  log(`\n${failures} failed, ${warnings} warnings (${mode}, ${base})`);
  return { failures, warnings };
}

module.exports = { smokeChecks, runSmoke, MARKET_PROBES, SIGNED_IN_FUNCTIONS, NETLIFY_ONLY_POST, NETLIFY_ONLY_GET };

if (require.main === module) {
  const args = process.argv.slice(2);
  const origin = args.find((a) => !a.startsWith('--'));
  const mode = (args.find((a) => a.startsWith('--mode=')) || '--mode=backup').slice(7);
  if (!origin || !['backup', 'netlify'].includes(mode)) {
    console.error('Usage: node scripts/smoke-web-backup.js <origin> [--mode=backup|netlify]');
    process.exitCode = 2;
  } else {
    runSmoke(origin, { mode }).then(({ failures }) => {
      process.exitCode = failures > 0 ? 1 : 0;
    });
  }
}
