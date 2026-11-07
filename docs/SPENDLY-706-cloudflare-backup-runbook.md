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
| a. Create the Pages project `spendly-web-backup` (Direct Upload, production branch `main`) | Pending |
| b. API token (Account → Cloudflare Pages → Edit only) and Account ID | Pending |
| c. GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variables `CLOUDFLARE_BACKUP_ORIGIN` (+ optional `CLOUDFLARE_PAGES_PROJECT`) | Pending |
| d. Run "Deploy Web Backup (Cloudflare Pages)" once. The workflow file must be on `main` first: `workflow_dispatch` only appears for workflows on the default branch. | Pending |
| e. Firebase Auth authorized domain (+ App Check key domain if web App Check is on) | Pending |

## First end-to-end run
Not run yet; it needs the steps above. To be recorded here:
- the run number;
- the smoke result;
- a manual sign-in on the backup;
- the CPU per request from the Cloudflare dashboard (especially market-overview);
- confirmation that `spendly-share.netlify.app` was untouched.
