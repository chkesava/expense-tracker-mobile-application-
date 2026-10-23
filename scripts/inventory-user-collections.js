#!/usr/bin/env node

/**
 * SPENDLY-502 — read-only inventory of the subcollections under `users/{uid}`.
 *
 * The SPENDLY-494 ADR has to know which collections actually exist per user
 * (legacy `focus`/`goals`/`profile`, Nutrition docs, …) before it can fix the
 * read-model waves and exclusions. This lists them with `listCollections()`, the
 * same call `netlify/functions/delete-account.ts` uses, and prints only
 * aggregates: how many users have each collection name and, optionally, how
 * many documents it holds in total.
 *
 * It never writes, and it never prints a uid, document id or field value.
 * `users/{uid}_duress` decoy trees are counted but never opened.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT
 * (same as scripts/detect-duplicate-credit-card-bills.js).
 *
 * Usage:
 *   # Local emulator (FIRESTORE_EMULATOR_HOST set, demo- project): no flag needed
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/inventory-user-collections.js
 *
 *   # Production: needs the explicit flag, and the user's approval first
 *   node scripts/inventory-user-collections.js --production [--doc-counts] [--json]
 *
 * `--doc-counts` runs one `count()` aggregation per (user, collection). Each is
 * billed as one read per 1,000 index entries, so leave it off unless the ADR
 * needs sizing numbers.
 */

const WAVE_1 = [
  "expenses",
  "incomes",
  "ledgerEvents",
  "accounts",
  "accountTypes",
  "accountTransfers",
  "accountEntries",
  "accountPayments",
  "creditCardBills",
  "categories",
];
const WAVE_2 = [
  "borrowings",
  "borrowingRepayments",
  "receivables",
  "receivableRepayments",
  "subscriptions",
];
const WAVE_3 = [
  "investments",
  "holdings",
  "portfolioTransactions",
  "investmentCashTransactions",
  "portfolioSettings",
];
/** Never synced (SPENDLY-494 "Out of scope"; audit §4.1.5 for financialSummaries). */
const EXCLUDED = ["meta", "stats", "notifications", "financialSummaries"];

const DURESS_SUFFIX = "_duress";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** Which read-model bucket a collection name falls into. Pure, for tests. */
function classifyCollection(name) {
  if (WAVE_1.includes(name)) return "wave1";
  if (WAVE_2.includes(name)) return "wave2";
  if (WAVE_3.includes(name) || name.startsWith("epf")) return "wave3";
  if (EXCLUDED.includes(name)) return "excluded";
  return "unassigned";
}

function isDuressUserId(id) {
  return id.endsWith(DURESS_SUFFIX);
}

/**
 * Why the inventory must not run, or null. Production needs `--production`;
 * an emulator target must be local. Pure, for tests.
 */
function runBlocker({ emulatorHost, production }) {
  if (emulatorHost) {
    const host = String(emulatorHost).split(":")[0].trim().toLowerCase();
    if (!LOCAL_HOSTS.has(host)) return "FIRESTORE_EMULATOR_HOST must point at a local emulator";
    if (production) return "--production cannot be combined with FIRESTORE_EMULATOR_HOST";
    return null;
  }
  if (!production) {
    return "no FIRESTORE_EMULATOR_HOST set; pass --production to read the live project (approval required)";
  }
  return null;
}

/**
 * Folds per-user listings into aggregates that carry no identifiers.
 * `users` is `[{ collections: [{ name, docCount? }] }]`. Pure, for tests.
 */
function aggregateInventory(users) {
  const byName = new Map();
  for (const user of users) {
    for (const { name, docCount } of user.collections) {
      const row = byName.get(name) || {
        name,
        bucket: classifyCollection(name),
        users: 0,
        docs: null,
      };
      row.users += 1;
      if (typeof docCount === "number") row.docs = (row.docs || 0) + docCount;
      byName.set(name, row);
    }
  }
  const order = ["wave1", "wave2", "wave3", "excluded", "unassigned"];
  return [...byName.values()].sort(
    (a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket) || a.name.localeCompare(b.name),
  );
}

/** Wave collections no user has: candidates for dropping from the ADR's waves. */
function missingWaveCollections(rows) {
  const present = new Set(rows.map((row) => row.name));
  return [...WAVE_1, ...WAVE_2, ...WAVE_3].filter((name) => !present.has(name));
}

function formatReport({ target, userCount, duressCount, failures, rows, docCounts }) {
  const lines = [];
  lines.push(`Target: ${target}`);
  lines.push(`User trees inventoried: ${userCount} (duress trees counted, not opened: ${duressCount})`);
  const failureKinds = Object.entries(failures);
  if (failureKinds.length > 0) {
    lines.push(
      `Users that failed to list: ${failureKinds.map(([kind, n]) => `${kind}=${n}`).join(", ")}`,
    );
  }
  lines.push("");
  lines.push(`bucket      users  ${docCounts ? "   docs  " : ""}collection`);
  for (const row of rows) {
    const docs = docCounts ? `${String(row.docs ?? "-").padStart(7)}  ` : "";
    lines.push(`${row.bucket.padEnd(10)}  ${String(row.users).padStart(5)}  ${docs}${row.name}`);
  }
  const missing = missingWaveCollections(rows);
  if (missing.length > 0) {
    lines.push("");
    lines.push(`Wave collections present for no user: ${missing.join(", ")}`);
  }
  lines.push("");
  lines.push("Read-only: no writes. No uids, document ids or field values printed.");
  return lines.join("\n");
}

function loadCredential() {
  const { applicationDefault, cert } = require("firebase-admin/app");
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents.",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const production = args.includes("--production");
  const docCounts = args.includes("--doc-counts");
  const asJson = args.includes("--json");
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  const blocker = runBlocker({ emulatorHost, production });
  if (blocker) {
    console.error(`Refusing to run: ${blocker}.`);
    process.exit(1);
  }

  // Required lazily, after the target is settled.
  const { initializeApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = emulatorHost
    ? initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-spendly" }, "spendly-inventory")
    : initializeApp({ credential: loadCredential() }, "spendly-inventory");
  const db = getFirestore(app);
  const target = emulatorHost ? `emulator ${emulatorHost} (${app.options.projectId})` : "production";

  const userRefs = await db.collection("users").listDocuments();
  const users = [];
  const failures = {};
  let duressCount = 0;

  for (const userRef of userRefs) {
    if (isDuressUserId(userRef.id)) {
      duressCount += 1;
      continue;
    }
    try {
      const collections = await userRef.listCollections();
      const listed = [];
      for (const collection of collections) {
        const entry = { name: collection.id };
        if (docCounts) {
          const snap = await collection.count().get();
          entry.docCount = snap.data().count;
        }
        listed.push(entry);
      }
      users.push({ collections: listed });
    } catch (error) {
      // Tallied by kind only, so the report never names the user.
      const kind = String((error && (error.code ?? error.name)) || "unknown");
      failures[kind] = (failures[kind] || 0) + 1;
    }
  }

  const rows = aggregateInventory(users);
  const report = { target, userCount: users.length, duressCount, failures, rows, docCounts };
  if (asJson) {
    console.log(JSON.stringify({ ...report, missingWaveCollections: missingWaveCollections(rows) }, null, 2));
  } else {
    console.log(formatReport(report));
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  aggregateInventory,
  classifyCollection,
  formatReport,
  isDuressUserId,
  missingWaveCollections,
  runBlocker,
};
