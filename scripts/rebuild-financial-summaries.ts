import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { runRebuildCli } from "./lib/rebuildRunner";

/**
 * Rebuilds stored account balances (bank `currentBalance`, card
 * `currentOutstanding`) for one or all users, or one account. Same runner and
 * same single reference as rebuild-domain-summaries.ts and the in-app rebuild
 * (SPENDLY-499); this entry point only limits it to accounts.
 *
 * Dry-run by default; nothing is written without --apply.
 *
 *   npx tsx scripts/rebuild-financial-summaries.ts [--uid=<uid>] [--accountId=<id>] [--apply]
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

runRebuildCli(db, process.argv.slice(2), { accounts: true, epf: false, dashboards: false })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
