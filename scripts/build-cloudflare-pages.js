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
 * - SPENDLY-750: `assets/node_modules/` is renamed to `assets/vendor_modules/`
 *   and references rewritten because Wrangler Pages deployment excludes
 *   `**\/node_modules\/**`, which would cause font and icon assets to be dropped.
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

/** Destination subfolder under `assets/` for npm-derived assets on Cloudflare Pages. */
const VENDOR_ASSETS_DIR = 'vendor_modules';

const REQUIRED_INTER_WEIGHTS = [
  'Inter_400Regular',
  'Inter_500Medium',
  'Inter_600SemiBold',
  'Inter_700Bold',
];

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

/**
 * Wrangler's Pages deployment logic (`wrangler pages deploy`) uses a hardcoded
 * exclusion pattern that ignores any directory named `node_modules` when uploading
 * static files to Cloudflare Pages. Metro exports web font and icon assets from
 * npm dependencies into `<base>/assets/node_modules/...`.
 *
 * This function:
 * 1. Renames any `assets/node_modules` directory under `dir` to `assets/vendor_modules`.
 * 2. Rewrites all occurrences of `assets/node_modules` to `assets/vendor_modules`
 *    in all compiled web bundles, markup, and stylesheets.
 */
function relocateVendorAssets(dir) {
  function renameAssets(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' && path.basename(current) === 'assets') {
          const dest = path.join(current, VENDOR_ASSETS_DIR);
          if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
          fs.renameSync(full, dest);
          renameAssets(dest);
        } else {
          renameAssets(full);
        }
      }
    }
  }
  renameAssets(dir);

  function rewriteReferences(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        rewriteReferences(full);
      } else if (/\.(js|html|json|css|map)$/.test(entry.name)) {
        let content = fs.readFileSync(full, 'utf8');
        if (
          content.includes('assets/node_modules') ||
          content.includes('assets\\/node_modules') ||
          content.includes('assets%2Fnode_modules')
        ) {
          content = content
            .replace(/assets\/node_modules/g, `assets/${VENDOR_ASSETS_DIR}`)
            .replace(/assets\\\/node_modules/g, `assets\\/${VENDOR_ASSETS_DIR}`)
            .replace(/assets%2Fnode_modules/g, `assets%2F${VENDOR_ASSETS_DIR}`);
          fs.writeFileSync(full, content, 'utf8');
        }
      }
    }
  }
  rewriteReferences(dir);
}

/** Verifies that no node_modules directories remain anywhere in the Pages output. */
function assertNoIgnoredNodeModules(dir) {
  const ignored = [];
  function scan(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') ignored.push(path.relative(dir, full));
        scan(full);
      }
    }
  }
  scan(dir);
  if (ignored.length > 0) {
    throw new Error(
      `Found node_modules directories in Pages output which Wrangler would drop during deployment: ${ignored.join(', ')}`
    );
  }
}

/**
 * Verifies that required Inter font assets exist on disk in the relocated
 * vendor_modules directory and are referenced by the expense app JS bundle.
 */
function assertInterFontAssets(dir) {
  const expenseDir = path.join(dir, 'expense');
  if (!fs.existsSync(expenseDir)) return;

  const interFontDir = path.join(expenseDir, 'assets', VENDOR_ASSETS_DIR, '@expo-google-fonts', 'inter');
  if (!fs.existsSync(interFontDir)) {
    // If the source build had no Inter fonts (e.g. lightweight mock), skip
    return;
  }

  for (const weight of REQUIRED_INTER_WEIGHTS) {
    const weightDir = path.join(interFontDir, weight.replace('Inter_', ''));
    if (!fs.existsSync(weightDir)) {
      throw new Error(`Required Inter font weight directory "${weight}" is missing in ${weightDir}.`);
    }
    const ttfFiles = fs.readdirSync(weightDir).filter((f) => f.endsWith('.ttf'));
    if (ttfFiles.length === 0) {
      throw new Error(`Required Inter font TTF for "${weight}" is missing in ${weightDir}.`);
    }
  }

  const jsDir = path.join(expenseDir, '_expo', 'static', 'js', 'web');
  if (fs.existsSync(jsDir)) {
    const entryFiles = fs.readdirSync(jsDir).filter((f) => f.startsWith('entry-') && f.endsWith('.js'));
    for (const entryFile of entryFiles) {
      const content = fs.readFileSync(path.join(jsDir, entryFile), 'utf8');
      if (content.includes('assets/node_modules/@expo-google-fonts/inter')) {
        throw new Error(
          `Bundle ${entryFile} still contains un-relocated assets/node_modules/@expo-google-fonts/inter font reference.`
        );
      }
      if (!content.includes(`assets/${VENDOR_ASSETS_DIR}/@expo-google-fonts/inter`)) {
        throw new Error(
          `Bundle ${entryFile} is missing required relocated assets/${VENDOR_ASSETS_DIR}/@expo-google-fonts/inter font reference.`
        );
      }
    }
  }
}

function buildCloudflarePages(fromDir, toDir, limits = PAGES_LIMITS) {
  assertWebExport(fromDir);
  fs.rmSync(toDir, { recursive: true, force: true });
  fs.cpSync(fromDir, toDir, { recursive: true });
  for (const name of NETLIFY_ONLY_FILES) fs.rmSync(path.join(toDir, name), { force: true });
  relocateVendorAssets(toDir);
  assertNoIgnoredNodeModules(toDir);
  assertInterFontAssets(toDir);
  fs.writeFileSync(path.join(toDir, '_headers'), cloudflareHeaders());
  fs.writeFileSync(path.join(toDir, '_routes.json'), `${JSON.stringify(cloudflareRoutes(), null, 2)}\n`);
  assertWithinPagesLimits(toDir, limits);
}

module.exports = {
  buildCloudflarePages,
  PAGES_LIMITS,
  VENDOR_ASSETS_DIR,
  REQUIRED_INTER_WEIGHTS,
  relocateVendorAssets,
  assertNoIgnoredNodeModules,
  assertInterFontAssets,
};

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
