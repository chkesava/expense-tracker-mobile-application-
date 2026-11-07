# Web backup on Cloudflare Pages: runbook

The Spendly web app is hosted on Netlify (`spendly-share.netlify.app`). That's
the **primary**, and nothing here changes it. This runbook covers the **backup**
copy on Cloudflare Pages, for when Netlify is out of credits or down
(epic SPENDLY-621).

- **Manual only.** The backup is deployed by hand with **Actions → "Deploy Web
  Backup (Cloudflare Pages)" → Run workflow**. Nothing deploys on push, and nothing
  is scheduled on Cloudflare.
- **Same backend.** Both hosts serve the same app against the same Firebase and
  Supabase projects. There is no data to copy or sync between them.
- **Web only.** Installed Android apps keep calling Netlify (follow-up
  SPENDLY-707).

Background:
- [SPENDLY-621-cloudflare-web-backup.md](SPENDLY-621-cloudflare-web-backup.md) (epic tracker, decisions)
- [SPENDLY-621-compatibility.md](SPENDLY-621-compatibility.md) (what runs on Cloudflare and why)

---

## 1. What works on the backup

| Works | Not on the backup (Netlify only) |
|---|---|
| All four apps: `/` (landing), `/expense`, `/nutrition`, `/ganesh`, with deep links and refresh | **Ganesh festival totals** (ganesh-summary) |
| Share links `/split/<slug>`, `/payment/<slug>` | **Token Laddu draw** (ganesh-draw) |
| Sign-in, all reads and writes (they go straight to Firebase / Supabase) | **Delete account** (delete-account) |
| Market prices: stocks, mutual funds, crypto, stock history, market overview, watchlist quotes | **Stock screener** (screener-universe: over the Free CPU limit) |
| Nutrition AI (nutrition-ai) | **Per-save copy to the read model** (readmodel-push): the nightly sync catches up |
| Read-model access for signed-in users (readmodel-claims) | **Monthly EPF job** (epf-cron): stays on Netlify's GitHub schedule |

The features in the right column answer **"This feature isn't available on the
backup site. Try again later."** (HTTP 503), and the app shows that message.
The four Firestore functions can't run on Cloudflare (Firestore Admin is blocked
there), and the screener needs about 200 ms of CPU against the Free plan's 10 ms.
The owner decided not to rewrite any of them (decision D5).

---

## 2. One-time setup (owner)

Do these once, in order. Steps a–d are needed before the first deploy;
step e is needed for sign-in to work on the backup.

### a. Create the Pages project
**Direct Upload, never connected to Git.** A Git-connected project would build on
every push.

With wrangler on your machine:
```
npx wrangler@4.158.0 login
npx wrangler@4.158.0 pages project create spendly-web-backup --production-branch main
```
Or in the dashboard: **Workers & Pages → Create → Pages → Upload assets**, named
`spendly-web-backup`. Upload nothing; the workflow does.

Its address is **`https://spendly-web-backup.pages.dev`**. Use that below. If you
pick another name, use it everywhere instead.

### b. Create an API token (least privilege)
1. Go to **My Profile → API Tokens → Create Token → Create Custom Token**.
2. Set it up:
   - **Permissions:** Account → **Cloudflare Pages → Edit**. Nothing else.
   - **Account resources:** include only your account.
   - Optionally an expiry date (then add a reminder to rotate it).
3. Copy the token. It is shown once.

The **Account ID** is on the account's Workers & Pages overview page (right-hand
side).

### c. GitHub secrets and variables
In **repo → Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | the token from b |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | the account ID from b |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | `spendly-web-backup` (optional: that's the default) |
| Variable | `CLOUDFLARE_BACKUP_ORIGIN` | `https://spendly-web-backup.pages.dev` (no trailing slash) |

Everything else is **reused** from the Netlify setup and must already exist; see
the checklist in §3.

### d. First deploy
1. Go to **Actions → Deploy Web Backup (Cloudflare Pages) → Run workflow** on `main`.
2. It takes about 30–40 minutes (rules, tests, typecheck, four web builds).
3. Expect a green run with the smoke test at **0 failed**. The job summary lists
   the URLs.

### e. Let sign-in work on the backup's address
1. **Firebase Auth authorized domains.** In the Firebase console (project
   `expenseapp-27f94`), go to **Authentication → Settings → Authorized domains →
   Add domain** and add `spendly-web-backup.pages.dev`. Google pop-up sign-in and
   Ganesh phone sign-in (reCAPTCHA) refuse unlisted domains.
2. **App Check reCAPTCHA key.** Only if web App Check is on, i.e.
   `EXPO_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_KEY` is in `MOBILE_ENV_FILE`. In the
   Google Cloud console go to **Security → reCAPTCHA → that key → Domains** and add
   `spendly-web-backup.pages.dev`.
3. **Google OAuth client.** Usually no change: the pop-up runs on the Firebase
   auth domain. Only if Google shows `origin_mismatch`, add
   `https://spendly-web-backup.pages.dev` to the web client's **Authorized
   JavaScript origins** (Google Cloud → APIs & Services → Credentials).
4. **Supabase:** no change. The read model trusts Firebase tokens whatever page
   they come from.

Then follow §5 (Verify).

---

## 3. Secrets checklist

Only `EXPO_PUBLIC_*` values may reach the app bundle. They are public by design.
Everything else stays on the server. The workflow refuses to deploy if the Gemini
key, the service account's key id or any private key is found in the output.

| Name | Where it's kept | Used by | Client or server |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub secret | the workflow (deploy, set Pages secrets) | **Server** (CI only) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub secret | the workflow | CI only (not sensitive, kept as a secret) |
| `CLOUDFLARE_PAGES_PROJECT` | GitHub variable | the workflow | CI only |
| `CLOUDFLARE_BACKUP_ORIGIN` | GitHub variable | the workflow: becomes `EXPO_PUBLIC_SHARE_URL`; the smoke test | Client (public address) |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub secret → **Pages secret** (set by the workflow) | readmodel-claims, nutrition-ai (verify sign-ins, set the read-model claim) | **Server** |
| `GEMINI_API_KEY` (falls back to the older `EXPO_PUBLIC_GEMINI_API_KEY` secret, as the Netlify deploy does) | GitHub secret → **Pages secret** | nutrition-ai | **Server**. Never in the app; the workflow strips `EXPO_PUBLIC_GEMINI_API_KEY` from `.env`. |
| `MOBILE_ENV_FILE` *or* the individual `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_SUPABASE_*`, `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_APP_URL` secrets | GitHub secrets (shared with the Netlify workflow) | the web build | Client (public config) |
| `READMODEL_SUPABASE_URL` | GitHub variable (shared) | the web build, as `EXPO_PUBLIC_READMODEL_SUPABASE_URL` | Client |
| `EXPO_PUBLIC_SHARE_URL` | **Not used** by this workflow | replaced by `CLOUDFLARE_BACKUP_ORIGIN` | Client |

**Not needed on the backup** (their functions aren't served):
- `EPF_CRON_SECRET`
- `READMODEL_SUPABASE_URL` / `READMODEL_SUPABASE_SERVICE_ROLE_KEY` as function settings

Don't add them to Cloudflare.

**Rotation:**
- Rotating the Cloudflare token only needs the GitHub secret updated.
- Rotating `FIREBASE_SERVICE_ACCOUNT` or `GEMINI_API_KEY` needs the GitHub secret
  updated, then **both** deploys re-run (Netlify and the backup), since each copies
  it to its own host.

---

## 4. Free plan limits (check before relying on the backup)

These were current on 2026-11-07. **Cloudflare changes its limits; check its
pricing and limits pages before a cutover.**

| Limit | Free plan | Spendly today |
|---|---|---|
| Static requests and bandwidth | Unlimited | `_expo/` and `assets/` never run the Worker (`_routes.json`) |
| Worker requests | 100,000 / day | Page loads and API calls only |
| CPU per Worker request | 10 ms | Market functions about 2–8 ms per uncached call; **market-overview about 16 ms uncached**, but cached for 15 min (confirm in the dashboard after the first deploy) |
| Outbound calls per request | 50 | At most 6 (market-overview) |
| Worker size | 3 MB gzipped | 0.27 MB (`build:cloudflare-worker` fails over the limit) |
| Files per deployment | 20,000 | About 230 (`build:cloudflare-pages` fails over the limit) |
| Size per file | 25 MiB | Largest bundle about 10 MB (`build:cloudflare-pages` fails over the limit) |
| Deployments | Check the current monthly limit | One per manual run |

When a request goes over the CPU limit, Cloudflare answers with its own error page
(1102) for that request only; the rest of the site keeps working.

---

## 5. Verify a deploy

1. The workflow's **Smoke test the backup** step shows 0 failed. A `WARN` on a
   market API means Yahoo, mfapi or CoinGecko was slow; rerun the smoke test later
   (step 2).
2. To rerun the smoke test from your machine:
   ```
   node scripts/smoke-web-backup.js https://spendly-web-backup.pages.dev --mode=backup
   ```
3. By hand, in a private window:
   - open `https://spendly-web-backup.pages.dev/expense`;
   - sign in with Google; the dashboard loads your data;
   - check prices in Investments;
   - refresh on a deep link (for example the settings screen);
   - open a split share link with the host changed to the backup.
4. In the Cloudflare dashboard, go to **Workers & Pages → spendly-web-backup →
   Metrics / Logs** and check that the CPU time per request stays under 10 ms.

---

## 6. Using it when Netlify is unavailable

1. Run the workflow (§2d) if the backup is older than the changes users need. It
   doesn't depend on Netlify at all.
2. Tell web users to use `https://spendly-web-backup.pages.dev/expense` (or
   `/nutrition`, `/ganesh`).
3. **Share links made on the backup** point at the backup. Links made earlier
   point at Netlify; changing the host by hand to the backup's address opens the
   same share.
4. **Android apps still call Netlify** for prices, Nutrition AI, Ganesh phone
   sign-in and share links (SPENDLY-707).
5. The features in §1's right-hand column wait for Netlify.

## 7. Rollback (a bad backup deploy)

**Fastest:** in the dashboard go to **Workers & Pages → spendly-web-backup →
Deployments**, open the last good deployment, then **⋯ → Rollback to this
deployment**.

**Or from code:**
1. Run the workflow again from the last good commit: **Run workflow → Use
   workflow from →** a branch or tag at that commit.
2. Check the smoke test result.

A backup rollback never affects Netlify.

## 8. Going back to Netlify

There is nothing to switch back. Netlify stays primary and its URLs never
changed. When Netlify works again:
1. Tell users to go back to `https://spendly-share.netlify.app/…`.
2. Confirm the nightly read-model sync ran.
3. Run anything that waited (a Ganesh totals rebuild, a pending account deletion),
   or the EPF job if its scheduled day passed while Netlify was down.

Leave the backup as it is; it costs nothing while idle.

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Workflow fails at "Check the backup settings" | A secret or variable from §2c is missing, or the origin isn't `https://…` or points at Netlify |
| "The backup origin is not in the built app" | `CLOUDFLARE_BACKUP_ORIGIN` wasn't applied to `.env`; check the variable's spelling |
| "Server secrets found in dist-cloudflare" | An `EXPO_PUBLIC_` copy of a server secret exists in `MOBILE_ENV_FILE`; remove it there |
| "Cloudflare refused access to Pages project" (in "Check the backup settings"), or `Authentication error [code: 10000]` | The token can't reach the project. Check, in order: (1) the token is active (`curl -H "Authorization: Bearer <token>" https://api.cloudflare.com/client/v4/user/tokens/verify`); (2) it has **Account → Cloudflare Pages → Edit**, with **Account Resources** including the account that holds `spendly-web-backup`; (3) `CLOUDFLARE_ACCOUNT_ID` is that account's ID; (4) both GitHub secrets were pasted without quotes, spaces or a trailing newline |
| `pages secret put` / deploy: project not found | §2a not done, or a different project name (set `CLOUDFLARE_PAGES_PROJECT`) |
| Sign-in fails with "unauthorized domain" / reCAPTCHA error | §2e step 1 (and step 2 if App Check is on) |
| `readmodel-claims` 401 for signed-in users / read model doesn't load | `FIREBASE_SERVICE_ACCOUNT` Pages secret missing or stale; rerun the workflow |
| Nutrition AI 500 | Neither `GEMINI_API_KEY` nor `EXPO_PUBLIC_GEMINI_API_KEY` is set; add `GEMINI_API_KEY` and rerun |
| 503 "not available on the backup site" | Expected for the §1 right-hand column |
| Cloudflare error 1102 on `/api/market-overview` | Over the Free CPU limit on an uncached call; it clears once cached (15 min). If it persists, add `market-overview` to `NETLIFY_ONLY_FUNCTIONS` in `cloudflare/functions.ts` |
| A deep link shows the wrong app or 404 | `_routes.json` / `_worker.js` missing from the deployment; check the "Make the Cloudflare Pages output" step |

## 10. Files

| File | Purpose |
|---|---|
| `.github/workflows/web-deploy-cloudflare-backup.yml` | The manual deploy |
| `scripts/lib/webHosting.js` | One routing/header table for both hosts |
| `scripts/build-cloudflare-pages.js` | `dist-web/` → `dist-cloudflare/` (headers, routes, limits) |
| `scripts/build-cloudflare-worker.js` | Bundles the Worker into `_worker.js` |
| `cloudflare/` | The Worker (`worker.ts`, `router.ts`, `edgeCache.ts`, `netlifyAdapter.ts`), the served/Netlify-only list (`functions.ts`), the Pages config (`wrangler.toml`) |
| `scripts/smoke-web-backup.js` | Smoke test (`--mode=backup` or `--mode=netlify`) |
