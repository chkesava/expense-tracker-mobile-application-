import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { runRebuildCli } from "./lib/rebuildRunner";

/**
 * Rebuilds every derived financial value for one or all users: account
 * balances (and card totals), the EPF summary and the dashboard periods.
 * The logic lives in scripts/lib/rebuildRunner.ts, shared with
 * rebuild-financial-summaries.ts and (through shared/utils/reconciliation.ts)
 * with the in-app rebuild (SPENDLY-499).
 *
 * Dry-run by default; nothing is written without --apply.
 *
 *   npx tsx scripts/rebuild-domain-summaries.ts [--uid=<uid>] [--apply] [--override-zeros]
 */
function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents."
  );
}

const db = getFirestore(initializeApp({ credential: loadCredential() }));

runRebuildCli(db, process.argv.slice(2), { accounts: true, epf: true, dashboards: true })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
