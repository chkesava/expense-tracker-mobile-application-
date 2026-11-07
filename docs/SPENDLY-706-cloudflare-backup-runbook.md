# SPENDLY-706 — Runbook, secrets checklist, owner setup and first end-to-end run

Part of epic [SPENDLY-621](SPENDLY-621-cloudflare-web-backup.md).

## Done in code
- **[WEB_BACKUP_CLOUDFLARE_RUNBOOK.md](WEB_BACKUP_CLOUDFLARE_RUNBOOK.md)** covers:
  - what the backup covers and what it doesn't;
  - one-time setup: the Pages project, a least-privilege token, GitHub secrets
    and variables, Firebase authorized domains, the App Check key, the OAuth
    client;
  - the secrets checklist: every name, where it's kept, who uses it, client or
    server;
  - Free plan limits, with today's numbers;
  - verifying, using it during an outage, rollback, going back to Netlify, and
    troubleshooting.

  It's linked from the README docs index.
- **`scripts/build-cloudflare-pages.js`** now fails if the output goes over the
  Pages per-deployment limits (20,000 files, 25 MiB per file). Today's build is
  about 230 files, largest about 10 MB. Test in `scripts/webHosting.test.ts`.

## Owner steps (runbook §2)
| Step | State |
|---|---|
| a. Create the Pages project `spendly-web-backup` (Direct Upload, production branch `main`) | Done (owner, 2026-11-07) |
| b. API token (Account → Cloudflare Pages → Edit only) and Account ID | Done (owner, 2026-11-07) |
| c. GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variables `CLOUDFLARE_BACKUP_ORIGIN` (+ optional `CLOUDFLARE_PAGES_PROJECT`) | Done (owner, 2026-11-07) |
| d. Run "Deploy Web Backup (Cloudflare Pages)" once. The workflow file must be on `main` first: `workflow_dispatch` only appears for workflows on the default branch. | Done (owner, 2026-11-07) |
| e. Firebase Auth authorized domain (+ App Check key domain if web App Check is on) | Done (owner, 2026-11-07) |

## First end-to-end run
**Run 42341897313 (2026-11-07, `main` a54adea8): stopped before deploying, so
nothing reached Cloudflare.**
- **Passed:** the settings check (secrets and variables in place), rules, tests,
  typechecks, the four web builds and the Cloudflare output.
- **Stopped at:** the secret check, on "a-private-key". It was a false positive:
  `_worker.js` bundles `jose`, which contains the text
  `-----BEGIN PRIVATE KEY-----` to recognise PEM input.
- **Fix** (`fix/SPENDLY-705-backup-secret-check`): `scripts/check-backup-secrets.js`
  replaces the grep.
  - Browser files still fail on a key header.
  - `_worker.js` (server code, never served) fails only on an actual key
    (header + key data).
  - Secret values are looked for everywhere.
  - The smoke test now also checks that `/_worker.js` is never served.

**Run 42347422568 (2026-11-07, `main` de864a7a, after #268): stopped before
deploying.**
- **Passed:** everything up to and including the secret check.
- **Failed at:** "Set the backup's function secrets". Cloudflare answered
  `Authentication error [code: 10000]` for
  `/accounts/<id>/pages/projects/spendly-web-backup`: the API token can't reach
  the project (permission, account or token value). That's for the owner to
  fix (runbook §9).
- **Also seen:** `GEMINI_API_KEY` is empty in the repo secrets.
- **Fix** (`fix/SPENDLY-705-backup-gemini-fallback`):
  - fall back to `EXPO_PUBLIC_GEMINI_API_KEY`, as `web-deploy.yml` does;
  - the settings check now asks Cloudflare for the project first, so a bad
    token fails in seconds.

**Run 42354808510 (2026-11-07, `main` 6443f385, after the owner replaced the
token): succeeded.** The backup is live at https://spendly-web-backup.pages.dev
(deployment 7cfd8dd3).
- **Run:**
  - access check OK; `.env` with 12 `EXPO_PUBLIC_*` keys, with the backup as
    `EXPO_PUBLIC_SHARE_URL`;
  - `_worker.js` 0.27 MB gzipped; no server secret in the output;
  - `FIREBASE_SERVICE_ACCOUNT` and `GEMINI_API_KEY` set as Pages secrets;
    90 files uploaded.
- **Smoke test** (in the run, and again against the live site): **0 failed,
  1 warning**.
  - All four apps, deep links, the share routes, manifests, icons, security
    headers and immutable bundles pass.
  - Every served API passes, the Netlify-only paths give 503, and
    `/_worker.js` isn't served.
- **Warning:** `/api/crypto` gets 429 from CoinGecko on every call.
  - CoinGecko's free API limits Cloudflare's shared addresses, so crypto
    prices don't load on the backup.
  - Follow-up: a CoinGecko demo API key.
- **Owner check:** sign-in on the backup works, and the dashboard checks were fine.
- **Netlify:** `spendly-share.netlify.app` untouched. The workflow has no Netlify
  credentials.
