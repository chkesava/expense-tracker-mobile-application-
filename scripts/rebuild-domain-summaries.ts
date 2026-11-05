import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { runRebuildCli } from "./lib/rebuildRunner";
import { serverPushPorts } from "../netlify/functions/readmodel-push";

/**
 * Rebuilds every derived financial value for one or all users: account
 * balances (and card totals), the EPF summary and the dashboard periods.
 * The logic lives in scripts/lib/rebuildRunner.ts, shared with
 * rebuild-financial-summaries.ts and (through shared/utils/reconciliation.ts)
 * with the in-app rebuild (SPENDLY-499).
 *
 * Dry-run by default; nothing is written without --apply.
 *
 *   npx tsx scripts/rebuild-domain-summaries.ts [--uid=<uid>] [--only=<step,...>] [--apply] [--override-zeros]
 *
 * Steps: accounts, epf, dashboards, debtCaches (SPENDLY-605). `--only=debtCaches`
 * restamps just the borrowing / receivable caches that disagree with their rows.
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

// SPENDLY-680: an --apply run also copies what it wrote to the read model.
runRebuildCli(db, process.argv.slice(2), { accounts: true, epf: true, dashboards: true, debtCaches: true }, serverPushPorts(db, (line) => console.log(line)))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
