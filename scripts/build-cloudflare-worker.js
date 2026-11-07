/**
 * SPENDLY-703: bundles cloudflare/worker.ts into the Pages backup's
 * `_worker.js` (advanced mode), using wrangler's own bundler so the result
 * matches what Cloudflare runs (nodejs_compat polyfills included).
 *
 * Wrangler is pinned and run with npx rather than added to package.json:
 * it downloads the workerd runtime (~100 MB), which every `npm ci` (PR checks,
 * Android releases) would then pay for.
 *
 * Fails if the bundle is over the Workers Free limit (3 MB gzipped).
 *
 * Usage: node scripts/build-cloudflare-worker.js [--to=dist-cloudflare]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const WRANGLER = 'wrangler@4.158.0';
const FREE_PLAN_GZIP_LIMIT = 3 * 1024 * 1024;

function bundleWorker(toDir) {
  if (!fs.existsSync(toDir)) {
    throw new Error(`${path.relative(ROOT_DIR, toDir)} does not exist. Run \`npm run build:cloudflare-pages\` first.`);
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spendly-worker-'));
  try {
    const result = spawnSync(
      'npx',
      ['--yes', WRANGLER, 'deploy', '--dry-run', '--outdir', outDir, '--config', path.join('cloudflare', 'worker.wrangler.toml')],
      { cwd: ROOT_DIR, stdio: 'inherit', shell: process.platform === 'win32' }
    );
    if (result.status !== 0) throw new Error(`wrangler bundling failed (exit code ${result.status}).`);
    const bundle = fs.readFileSync(path.join(outDir, 'worker.js'));
    const gzipped = zlib.gzipSync(bundle).length;
    if (gzipped > FREE_PLAN_GZIP_LIMIT) {
      throw new Error(`_worker.js is ${(gzipped / 1048576).toFixed(2)} MB gzipped, over the Workers Free limit of 3 MB.`);
    }
    fs.writeFileSync(path.join(toDir, '_worker.js'), bundle);
    return { bytes: bundle.length, gzipped };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

module.exports = { bundleWorker, WRANGLER };

if (require.main === module) {
  const match = process.argv.slice(2).map((a) => /^--to=(.+)$/.exec(a)).find(Boolean);
  const toDir = path.resolve(ROOT_DIR, match ? match[1] : 'dist-cloudflare');
  try {
    const { bytes, gzipped } = bundleWorker(toDir);
    console.log(`_worker.js: ${(bytes / 1048576).toFixed(2)} MB, ${(gzipped / 1048576).toFixed(2)} MB gzipped`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
