# SPENDLY-621 — Cloudflare Pages backup for the Spendly web deployment

Epic branch: `feature/SPENDLY-621-cloudflare-web-backup` (from `main` 363e4e6a).
Worktree: `C:\dev\worktrees\spendly-621`.

## Why
The web apps and all 14 serverless functions run only on Netlify
(`spendly-share.netlify.app`). Netlify credits are running low, and if it runs
out or goes down, nothing serves the web apps. This epic adds a manually
triggered **backup** on Cloudflare Pages that does everything the Netlify
deployment does. Netlify stays the primary: `web-deploy.yml`, its secrets, its
site, and the app's default URLs don't change.

## Stories

| Key | Story | State |
|---|---|---|
| SPENDLY-701 | S1 Test on Cloudflare, compatibility matrix | Merged into epic ([matrix](SPENDLY-621-compatibility.md)) |
| SPENDLY-702 | S2 Static site and routing for Cloudflare Pages | Merged into epic (34d469a7) ([doc](SPENDLY-702-cloudflare-routing.md)) |
| SPENDLY-703 | S3 Worker, request adapter, the functions that run on Cloudflare | Built on `feature/SPENDLY-703-cloudflare-worker`, awaiting review ([doc](SPENDLY-703-cloudflare-worker.md)) |
| SPENDLY-704 | S4 The 6 firebase-admin functions | Won't do (D5) |
| SPENDLY-705 | S5 Manual-only backup workflow and smoke tests | To do |
| SPENDLY-706 | S6 Runbook, secrets checklist, operator setup, first end-to-end run | To do |

Follow-up, not in this epic: SPENDLY-707 native app failover.

## Decisions
- **D1:** the 6 firebase-admin functions are tested on Cloudflare first. Only the
  calls that fail are rewritten (Google REST behind a small port). Netlify keeps
  firebase-admin, and there's one copy of the business logic (owner, 2026-11-06).
- **D2:** Cloudflare **Free plan only**. A function that can't fit is declared
  not covered, with the reason (owner, 2026-11-06).
- **D3:** web only. Installed Android apps have the Netlify address built in;
  native failover is SPENDLY-707 (owner, 2026-11-06).
- **D4:** 621 is an epic (its type was changed from Feature), built story by
  story with approval before each merge and before each next story
  (owner, 2026-11-06).
- **D5 (replaces D1):** the backup implements **only the functions that run on
  Cloudflare as they are**; nothing is rewritten for it (owner, 2026-11-06, after
  SPENDLY-701).
  - **Covered:** stock, mutual-funds, crypto, stock-history, stock-quotes,
    market-overview, nutrition-ai, readmodel-claims.
  - **Not on the backup:** ganesh-summary, ganesh-draw, epf-cron, delete-account,
    readmodel-push (Firestore Admin can't run on Workers), and screener-universe
    (over the Free CPU limit).
  - Their paths answer a clear JSON **503 "not available on the backup"**, never the
    SPA's HTML. The app's existing error states handle that.
  - Netlify keeps serving all 14 unchanged. SPENDLY-704 is won't-do.

## What Netlify does today (main 363e4e6a)

**Static site:** `scripts/build-web.js` builds `/` (landing), `/expense`,
`/nutrition` and `/ganesh` into `dist-web/`. Each has its own manifest and PWA
icons. The share routes `/split/*` and `/payment/*` are served by the root app.
It also writes `_redirects` (16 rules) and `_headers` (immutable caching for
`_expo/` and `assets/`, plus security headers and the CSP).

**Functions:** `netlify/functions/*.ts`, plain `handler(event)`, bundled by
`scripts/bundle-netlify-fns.js`.

| Group | Functions | Called at | Cloudflare fit |
|---|---|---|---|
| Market data (plain fetch) | stock, mutual-funds, crypto, stock-history, market-overview, screener-universe, stock-quotes | `/api/<name>`, same origin (`services/marketDataService.ts`) | Same code through an adapter; re-create the Netlify CDN cache headers |
| Sign-in check only | nutrition-ai | `<SHARE_URL>/.netlify/functions/nutrition-ai` | Same code; may need a jose ID-token verifier |
| firebase-admin | readmodel-claims, readmodel-push, ganesh-summary, ganesh-draw, delete-account, epf-cron | `<SHARE_URL>/.netlify/functions/<name>`; epf-cron from `epf-cron.yml` | Test in S1 |

**Facts the design depends on:**
- **Function URLs are fixed at build time.** Non-market function URLs come from
  `getPublicAppOrigin()` (`shared/utils/paymentRequestUrl.ts`), which is
  `EXPO_PUBLIC_SHARE_URL`. The CSP's `connect-src` allows only the page's own
  origin. So the backup needs its own build with `EXPO_PUBLIC_SHARE_URL` set to
  the Cloudflare address, and Cloudflare must answer
  `/.netlify/functions/<name>`.
- **There are no Netlify scheduled functions.** epf-cron is called by
  `.github/workflows/epf-cron.yml`, which hard-codes the Netlify URL. Cron
  must never run on both providers.
- **Not every secret is set by the workflow.** `READMODEL_SUPABASE_URL` and
  `READMODEL_SUPABASE_SERVICE_ROLE_KEY` were set by hand on Netlify. The workflow
  sets `FIREBASE_SERVICE_ACCOUNT`, `EPF_CRON_SECRET` and `GEMINI_API_KEY`.
- **Free-plan risks:**
  - epf-cron makes more than 100 outbound calls per page.
  - delete-account is budgeted by time, not by number of calls.
  - The sign-in check may go over the 10 ms CPU limit.
- **ganesh-draw is not idempotent per request,** so a client must never retry it
  on another provider.

## Findings from S1 (SPENDLY-701)
- **Run unchanged on Workers:** the 7 market functions, nutrition-ai and
  readmodel-claims.
- **Firestore Admin can't run on Workers** (protobufjs code generation is
  forbidden). ganesh-summary, ganesh-draw, epf-cron, delete-account and
  readmodel-push need a Firestore REST port (S4). Firebase Auth admin works as-is.
- **Free plan:**
  - screener-universe is far over the 10 ms CPU limit (not covered);
  - market-overview is at risk;
  - readmodel-push `mode:"user"` is over 50 calls (not covered; the nightly sync
    catches up).
- **Routing:** Netlify's `_redirects` don't work on Pages as-is. A small Worker
  fallback (variant C) matches Netlify.

## Design
- **One Worker.** `cloudflare/worker.ts` is bundled to `_worker.js` (Pages
  advanced mode). The repo's root `functions/` folder is Firebase's, so Pages'
  own `functions/` folder can't be used. The Worker routes `/api/<name>` and
  `/.netlify/functions/<name>` to the existing handlers through a Request ↔
  Netlify-event adapter. Everything else is static.
- **`_routes.json`** sends only the API paths to the Worker, so static requests
  don't use the free Workers quota.
- **One shared routing table** produces both the Netlify output (unchanged,
  snapshot-tested) and the Cloudflare `_redirects` and `_headers`.
- **Secrets stay server-side,** set with `wrangler pages secret put`. Only
  `EXPO_PUBLIC_*` values reach the bundle.

## Drift
- `.claude/spendly_epic_execution_roadmap.md` isn't in the main checkout, so it
  couldn't be read to place this epic.
- The original 621 description listed 4 `/api` routes and assumed Netlify cron.
  The Jira description was rewritten on 2026-11-06.
