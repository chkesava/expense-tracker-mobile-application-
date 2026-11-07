/**
 * SPENDLY-233: the push delivery report. Run on demand by
 * .github/workflows/push-report.yml (or locally):
 *
 *   npx tsx scripts/push-report.ts [--days=7]
 *
 * Read-only. Counts use Firestore count() aggregations (about one read per
 * 1,000 documents). The send logs for the period are read in full; they hold
 * counts and error codes only, never tokens. Prints Markdown, and appends it to
 * the Actions job summary when GITHUB_STEP_SUMMARY is set.
 */

import { appendFileSync } from "node:fs";

import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { formatDeliveryReport, summarizeSendLogs } from "../shared/utils/push/deliveryReport";

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = Math.min(30, Math.max(1, Number(daysArg?.split("=")[1]) || 7));
  const raw = process.env.PUSH_FIREBASE_SERVICE_ACCOUNT;
  const app = process.env.FIRESTORE_EMULATOR_HOST
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" })
    : initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() });
  const db = getFirestore(app);
  const since = new Date(Date.now() - days * 86_400_000);

  const devicesQuery = db.collectionGroup("devices");
  const [devices, activeDevices, accounts, deviceOwners, logs] = await Promise.all([
    devicesQuery.count().get(),
    devicesQuery.where("lastSeenAt", ">=", since).count().get(),
    db.collection("users").count().get(),
    // Only the paths, to count distinct owners.
    devicesQuery.select().get(),
    db.collection("pushSendLogs").where("createdAt", ">=", since).get(),
  ]);
  const owners = new Set(
    deviceOwners.docs.map((d) => d.ref.path.split("/")).filter((p) => p.length === 4 && p[0] === "users").map((p) => p[1])
  );

  const report = formatDeliveryReport({
    days,
    devices: devices.data().count,
    activeDevices: activeDevices.data().count,
    usersWithDevice: owners.size,
    accounts: accounts.data().count,
    logs: summarizeSendLogs(logs.docs.map((d) => d.data())),
  });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
