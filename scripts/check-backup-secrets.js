/**
 * SPENDLY-705: refuses a Cloudflare backup deploy that would ship a server
 * secret. Run by .github/workflows/web-deploy-cloudflare-backup.yml before the
 * deploy:
 *
 *   GEMINI_API_KEY=… FIREBASE_SERVICE_ACCOUNT=… node scripts/check-backup-secrets.js dist-cloudflare
 *
 * Two kinds of file are checked differently:
 * - **Browser files** (everything Pages serves) must contain no secret value
 *   and not even a private-key header.
 * - **`_worker.js`** is server code: Pages runs it but never serves it. Its
 *   key-handling libraries (jose) contain the text "-----BEGIN PRIVATE KEY-----"
 *   to recognise PEM input, so only an actual key (header followed by key
 *   data) or a secret value counts there. The first backup run (42341897313)
 *   was stopped by that header in jose.
 *
 * The values looked for everywhere: the Gemini key, the service account's
 * private_key_id, and the start of its private key.
 */
const fs = require('fs');
const path = require('path');

const WORKER_FILE = '_worker.js';
const PEM_HEADER = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/;
/** A header followed by key data: newlines (real or escaped in a JS string), then base64. */
const PEM_KEY = /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----(?:\\n|\\r|\s)*[A-Za-z0-9+/]{40}/;

/** The secret values to look for, from the workflow's environment. Short values are ignored as too likely to collide. */
function secretValues(env) {
  const values = [];
  if ((env.GEMINI_API_KEY || '').trim().length >= 16) values.push(['GEMINI_API_KEY', env.GEMINI_API_KEY.trim()]);
  // SPENDLY-714: the CoinGecko Demo key is server-side too.
  if ((env.COINGECKO_API_KEY || '').trim().length >= 16) values.push(['COINGECKO_API_KEY', env.COINGECKO_API_KEY.trim()]);
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    let account = null;
    try {
      account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      account = null;
    }
    if (account && typeof account.private_key_id === 'string' && account.private_key_id.length >= 16) {
      values.push(['FIREBASE_SERVICE_ACCOUNT (private_key_id)', account.private_key_id]);
    }
    const body = account && typeof account.private_key === 'string' ? account.private_key.replace(PEM_HEADER, '').replace(/\s+/g, '') : '';
    if (body.length >= 40) values.push(['FIREBASE_SERVICE_ACCOUNT (private_key)', body.slice(0, 40)]);
  }
  return values;
}

/** Pure: `files` are { name (relative path), content }. Returns the leaks found; never the secret itself. */
function findLeaks(files, env) {
  const values = secretValues(env);
  const leaks = [];
  for (const { name, content } of files) {
    for (const [label, value] of values) {
      if (content.includes(value)) leaks.push({ file: name, kind: label });
    }
    const isWorker = name.replace(/\\/g, '/') === WORKER_FILE;
    if (PEM_KEY.test(content)) leaks.push({ file: name, kind: 'a private key' });
    else if (!isWorker && PEM_HEADER.test(content)) leaks.push({ file: name, kind: 'a private-key header in a browser file' });
  }
  return leaks;
}

function readTree(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push({ name: path.relative(dir, full), content: fs.readFileSync(full, 'latin1') });
    }
  };
  walk(dir);
  return out;
}

module.exports = { findLeaks, secretValues };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || 'dist-cloudflare');
  const leaks = findLeaks(readTree(dir), process.env);
  if (leaks.length > 0) {
    for (const leak of leaks) console.error(`::error::${leak.kind} found in ${leak.file}`);
    console.error('Server secrets found in the backup output. Not deploying.');
    process.exitCode = 1;
  } else {
    console.log(`No server secret in ${path.relative(process.cwd(), dir) || dir}.`);
  }
}
