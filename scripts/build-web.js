/**
 * Builds the multi-product web export deployed to spendly-share.netlify.app
 * (the same Netlify site that used to serve ONLY the /split and /payment
 * share pages via netlify.toml's git-triggered build — see that file's
 * header comment for why continuous deployment must stay OFF for this site
 * now that this workflow deploys the full multi-product app to it instead).
 *
 * Reuses the existing build-time product model exactly like Android: each
 * target (expense/nutrition/ganesh/landing) is a separate `expo export`
 * invocation with its own EXPO_PUBLIC_PRODUCT, producing a self-contained SPA
 * under its own sub-path (see app.config.js's experiments.baseUrl wiring,
 * gated behind EXPO_WEB_BUILD=1 so it can never affect an Android build).
 *
 * Usage: node scripts/build-web.js --target=expense|nutrition|ganesh|landing|all
 *
 * Does NOT touch `npm run build:web` / dist/ (the old narrow share-only
 * build path) — the "landing" target already includes /split/[slug] and
 * /payment/[slug] unconditionally (see app/_layout.tsx), so those pages keep
 * working from the new dist-web/ output instead.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PRODUCTS_DIR = path.join(ROOT_DIR, 'products');
const OUT_ROOT = path.join(ROOT_DIR, 'dist-web');

// Product builds first, "landing" last (it writes to OUT_ROOT itself, and
// each `expo export` copies public/** into its own output root — landing
// going last means its copy of public/** is what ends up at the site root).
const BUILD_ORDER = ['expense', 'nutrition', 'ganesh', 'landing'];

function parseArgs(argv) {
  const args = { target: 'all' };
  for (const arg of argv) {
    const match = /^--target=(.+)$/.exec(arg);
    if (match) args.target = match[1];
  }
  return args;
}

function loadProduct(target) {
  const file = path.join(PRODUCTS_DIR, `${target}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown web build target "${target}" (no products/${target}.json).`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function outDirFor(target, product) {
  if (target === 'landing') return OUT_ROOT;
  const basePath = product.web && product.web.basePath;
  if (!basePath) {
    throw new Error(`products/${target}.json is missing web.basePath.`);
  }
  return path.join(OUT_ROOT, basePath.replace(/^\//, ''));
}

function dirSizeBytes(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Injects the manifest link + Apple PWA meta tags into an exported index.html. */
function injectHeadTags(outDir, product) {
  const indexPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const basePath = (product.web && product.web.basePath) || '';
  const iconHref = `${basePath}/pwa-192.png`;
  const tags = [
    `<link rel="manifest" href="${basePath}/manifest.webmanifest" />`,
    `<link rel="apple-touch-icon" href="${iconHref}" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
  ].join('\n    ');
  const html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('</head>')) return;
  fs.writeFileSync(indexPath, html.replace('</head>', `    ${tags}\n  </head>`));
}

function writeManifest(outDir, product) {
  const web = product.web || {};
  const basePath = web.basePath || '';
  const manifest = {
    name: product.name,
    short_name: web.shortName || product.name,
    description: web.description || '',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: web.backgroundColor || '#071A2B',
    theme_color: web.themeColor || '#071A2B',
    icons: [
      { src: `${basePath}/pwa-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: `${basePath}/pwa-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}

function copyPwaIcons(outDir, target) {
  const pwaDir = path.join(ROOT_DIR, 'assets', 'branding', 'pwa');
  for (const size of ['192', '512']) {
    const src = path.join(pwaDir, `${target}-${size}.png`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, `pwa-${size}.png`));
    }
  }
}

function writeRedirectsAndHeaders() {
  const redirects = [
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
    '/*                 /index.html             200',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_ROOT, '_redirects'), redirects);

  const headers = [
    '/_expo/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/*/_expo/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/*/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/*',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_ROOT, '_headers'), headers);
}

function buildTarget(target) {
  const product = loadProduct(target);
  const outDir = outDirFor(target, product);

  console.log(`\n--- Building web target "${target}" -> ${path.relative(ROOT_DIR, outDir)} ---`);
  const result = spawnSync(
    'npx',
    ['expo', 'export', '--platform', 'web', '--output-dir', outDir, '--clear'],
    {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        EXPO_PUBLIC_PRODUCT: target,
        EXPO_WEB_BUILD: '1',
        NODE_ENV: 'production',
      },
    }
  );
  if (result.status !== 0) {
    throw new Error(`expo export failed for target "${target}" (exit code ${result.status}).`);
  }

  writeManifest(outDir, product);
  copyPwaIcons(outDir, target);
  injectHeadTags(outDir, product);

  const bytes = dirSizeBytes(outDir);
  console.log(`"${target}" bundle size: ${formatBytes(bytes)}`);
}

function main() {
  const { target } = parseArgs(process.argv.slice(2));
  const targets = target === 'all' ? BUILD_ORDER : [target];

  if (!BUILD_ORDER.includes(target) && target !== 'all') {
    throw new Error(`Unknown --target "${target}". Expected one of: ${BUILD_ORDER.join(', ')}, all.`);
  }

  if (target === 'all') {
    fs.rmSync(OUT_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  for (const t of targets) {
    buildTarget(t);
  }

  if (target === 'all') {
    writeRedirectsAndHeaders();
    console.log(`\nWeb build complete: ${path.relative(ROOT_DIR, OUT_ROOT)}`);
  }
}

main();
