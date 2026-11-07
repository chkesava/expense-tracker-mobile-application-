/**
 * SPENDLY-702: turns the Netlify web export (dist-web/) into the Cloudflare
 * Pages backup's output (dist-cloudflare/). The app files are the same; only
 * the host rules differ:
 *
 * - `_redirects` is dropped. Netlify's SPA rewrites loop or shadow real files
 *   on Pages, and its `/api/*` lines point at Netlify's function paths. The
 *   Worker (SPENDLY-703) does the SPA fallback and the API routing instead.
 * - `_headers` is rewritten with one rule per product folder, because Pages
 *   allows only one `*` per rule. The security headers are Netlify's.
 * - `_routes.json` sends everything but the content-hashed folders to the
 *   Worker.
 *
 * dist-web/ is never modified, so the same build can still go to Netlify.
 * The backup needs its own `build:web:all` run with EXPO_PUBLIC_SHARE_URL set
 * to the backup's address (see docs/SPENDLY-621-compatibility.md).
 *
 * Usage: node scripts/build-cloudflare-pages.js [--from=dist-web] [--to=dist-cloudflare]
 */
const fs = require('fs');
const path = require('path');
const { cloudflareHeaders, cloudflareRoutes, PRODUCT_BASE_PATHS } = require('./lib/webHosting');

const ROOT_DIR = path.resolve(__dirname, '..');

/** Files Netlify reads that mean something else, or nothing, on Pages. */
const NETLIFY_ONLY_FILES = ['_redirects'];

function assertWebExport(fromDir) {
  const missing = ['', ...PRODUCT_BASE_PATHS]
    .map((base) => path.join(fromDir, base, 'index.html'))
    .filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(
      `${path.relative(ROOT_DIR, fromDir) || fromDir} is not a complete web export (missing ${missing
        .map((file) => path.relative(fromDir, file))
        .join(', ')}). Run \`npm run build:web:all\` first.`
    );
  }
}

/** Cloudflare Pages Free limits per deployment (SPENDLY-706). Over them, the upload fails late and vaguely. */
const PAGES_LIMITS = { maxFiles: 20000, maxFileBytes: 25 * 1024 * 1024 };

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function assertWithinPagesLimits(dir, limits = PAGES_LIMITS) {
  const files = listFiles(dir);
  if (files.length > limits.maxFiles) {
    throw new Error(`${files.length} files is over the Cloudflare Pages limit of ${limits.maxFiles} per deployment.`);
  }
  const tooBig = files.filter((file) => fs.statSync(file).size > limits.maxFileBytes);
  if (tooBig.length > 0) {
    throw new Error(
      `Over the Cloudflare Pages limit of ${limits.maxFileBytes / 1048576} MiB per file: ${tooBig.map((f) => path.relative(dir, f)).join(', ')}`
    );
  }
}

function buildCloudflarePages(fromDir, toDir, limits = PAGES_LIMITS) {
  assertWebExport(fromDir);
  fs.rmSync(toDir, { recursive: true, force: true });
  fs.cpSync(fromDir, toDir, { recursive: true });
  for (const name of NETLIFY_ONLY_FILES) fs.rmSync(path.join(toDir, name), { force: true });
  fs.writeFileSync(path.join(toDir, '_headers'), cloudflareHeaders());
  fs.writeFileSync(path.join(toDir, '_routes.json'), `${JSON.stringify(cloudflareRoutes(), null, 2)}\n`);
  assertWithinPagesLimits(toDir, limits);
}

module.exports = { buildCloudflarePages, PAGES_LIMITS };

if (require.main === module) {
  const arg = (name, fallback) => {
    const match = process.argv.slice(2).map((a) => new RegExp(`^--${name}=(.+)$`).exec(a)).find(Boolean);
    return path.resolve(ROOT_DIR, match ? match[1] : fallback);
  };
  const fromDir = arg('from', 'dist-web');
  const toDir = arg('to', 'dist-cloudflare');
  try {
    buildCloudflarePages(fromDir, toDir);
    console.log(`Cloudflare Pages output: ${path.relative(ROOT_DIR, toDir)}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
