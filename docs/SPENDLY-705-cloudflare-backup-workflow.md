# SPENDLY-705 — Manual-only backup workflow and smoke tests

Part of epic [SPENDLY-621](SPENDLY-621-cloudflare-web-backup.md).

## Workflow: `.github/workflows/web-deploy-cloudflare-backup.yml`
**"Deploy Web Backup (Cloudflare Pages)".** It runs only when started by hand
(`workflow_dispatch`), in its own concurrency group. It never uses Netlify
credentials, and `web-deploy.yml` is unchanged.

| Step | What it does |
|---|---|
| Check the backup settings | Fails early without `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` or the `CLOUDFLARE_BACKUP_ORIGIN` variable. Rejects an origin that isn't `https://` or points at `netlify.app`. |
| Firestore rules, `npm ci`, `npm test`, both typechecks | The same gate as the Netlify deploy |
| Restore .env | The same `EXPO_PUBLIC_*` set as `web-deploy.yml`, then **`EXPO_PUBLIC_SHARE_URL` = the backup origin**. Gemini is stripped. |
| `build:web:all`, `build:cloudflare-pages`, `build:cloudflare-worker` | Builds `dist-cloudflare/` with `_worker.js`. Fails if the backup origin isn't inlined in the app. |
| Check no server secret reached the bundle | Stops if the Gemini key, the service account's key id or any private key is in `dist-cloudflare/` |
| Set the backup's function secrets | `wrangler pages secret put` `FIREBASE_SERVICE_ACCOUNT` (required) and `GEMINI_API_KEY`. Only the served functions need secrets (readmodel-claims, nutrition-ai). |
| Deploy to Cloudflare Pages | `wrangler pages deploy --project-name $CLOUDFLARE_PAGES_PROJECT --branch main`, from `cloudflare/` (its `wrangler.toml` sets `nodejs_compat`). Pages re-bundles the Worker. |
| Smoke test the backup | `node scripts/smoke-web-backup.js $CLOUDFLARE_BACKUP_ORIGIN --mode=backup`; a failure fails the run |

Wrangler is `wrangler@4.158.0` via npx, the same pin as
`scripts/build-cloudflare-worker.js` (a test keeps them equal).

## Smoke test: `scripts/smoke-web-backup.js`
`node scripts/smoke-web-backup.js <origin> [--mode=backup|netlify]`. It waits up
to a minute for a fresh deployment, then checks:
- **Each app** (root, expense, nutrition, ganesh): the right app is served (by its
  bundle path), plus a deep link, the manifest (`start_url`) and the PWA icon.
- **The share links:** `/split/…` and `/payment/…` serve the root app.
- **Security headers:** CSP, frame, nosniff, HSTS and robots on `/`.
- **A content-hashed bundle:** read from the HTML, it must be served as immutable.
- **Market APIs:** each must return JSON. A non-200 JSON answer is a warning
  (upstream market data); HTML is a failure.
- **nutrition-ai and readmodel-claims:** OPTIONS 204, and a POST **without
  credentials** must return a JSON 401.
- **The Netlify-only functions:**
  - backup mode: JSON 503 `BACKUP_UNAVAILABLE`;
  - Netlify mode: JSON, no credentials sent.
- **Backup mode only:** an unknown `/api` path must be a JSON 404, and a missing
  bundle file a 404. Netlify answers both with its `/*` rewrite.

It never changes data: GETs only, plus unauthenticated POSTs that every handler
rejects first. A test checks it never sends an `Authorization` header or the EPF
secret.

## Changed from the Jira text
- **epf-cron `target` input: not added.** Under D5, epf-cron isn't on the backup,
  so it stays Netlify-only and its workflow is unchanged. There's still no
  schedule on Cloudflare.
- **Function secrets:** only `FIREBASE_SERVICE_ACCOUNT` and `GEMINI_API_KEY`.
  `EPF_CRON_SECRET` and `READMODEL_*` belong to functions the backup doesn't
  run (D5).

## Tests
- **`scripts/smokeWebBackup.test.ts`:**
  - the smoke test passes a healthy backup (the real router over fake files and
    handlers);
  - it fails when an API returns HTML or a signed-in function accepts no
    credentials;
  - it only warns on an upstream outage;
  - it fails when the site never answers;
  - Netlify mode skips the backup-only checks;
  - its lists match `cloudflare/functions.ts`;
  - it sends no credentials.
- **The workflow** (same file): manual only; no Netlify credentials or deploy;
  backup origin applied and checked; the same gate as Netlify; build → secret
  check → deploy → smoke, in order; Pages re-bundles; same wrangler pin; Gemini
  stripped.
- **Locally:**
  - the smoke script passed 37/37 against the real bundled Worker under
    `wrangler pages dev`;
  - a real `build:web:expense` with a test `EXPO_PUBLIC_SHARE_URL` showed the
    address inlined in the Expense bundle, which the workflow's check relies on;
  - the workflow YAML parses (only trigger `workflow_dispatch`).
- **Not run:** the workflow itself. It needs the Cloudflare project and secrets
  from SPENDLY-706. The smoke test wasn't run against Netlify production either,
  since each call uses Netlify credits.
