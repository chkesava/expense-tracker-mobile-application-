#!/usr/bin/env node

/**
 * SPENDLY-386 — Audit script for prematurely completed EMIs
 *
 * This script identifies EMI items that have been marked as completed (isCompleted = true)
 * but for which the final scheduled payment (expense document) does not exist in the
 * user's expenses subcollection.
 *
 * It does NOT modify or repair any data. It simply detects and logs the affected records
 * to facilitate manual repair if needed.
 *
 * Usage:
 *   node scripts/audit-prematurely-completed-emis.js
 */

const { initializeApp, getApps, applicationDefault, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return applicationDefault();
  throw new Error(
    "Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents."
  );
}

// SPENDLY-40 idempotency key format for monthly items
function getExpectedDocId(subscriptionId, year, month) {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return `${subscriptionId}_${monthKey}`;
}

async function main() {
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: loadCredential() });
  const db = getFirestore(app);

  console.log("Starting audit for prematurely completed EMIs (SPENDLY-386)...");

  const users = await db.collection("users").listDocuments();
  let affectedEmiCount = 0;
  let affectedUserCount = 0;

  for (const userRef of users) {
    const subSnap = await userRef.collection("subscriptions")
      .where("type", "==", "emi")
      .where("isCompleted", "==", true)
      .get();

    if (subSnap.empty) continue;

    let userHasAffectedEmis = false;

    for (const docSnap of subSnap.docs) {
      const emi = docSnap.data();
      
      // If it doesn't have an end term specified, it shouldn't be completed
      if (emi.endYear === undefined || emi.endMonth === undefined) continue;

      const expectedDocId = getExpectedDocId(docSnap.id, emi.endYear, emi.endMonth);
      
      // Check if the final term expense exists
      const expenseRef = userRef.collection("expenses").doc(expectedDocId);
      const expenseSnap = await expenseRef.get();

      if (!expenseSnap.exists) {
        if (!userHasAffectedEmis) {
          console.log(`\nUser: ${userRef.id}`);
          userHasAffectedEmis = true;
          affectedUserCount++;
        }
        
        affectedEmiCount++;
        console.log(
          `  - EMI ID: ${docSnap.id} | Name: "${emi.name}"`
        );
        console.log(
          `    Expected final term: ${emi.endMonth}/${emi.endYear}, Billing Day: ${emi.dayOfMonth || "unknown"}`
        );
        console.log(
          `    MISSING final expense doc: ${expectedDocId}`
        );
      }
    }
  }

  console.log(`\nAudit complete.`);
  console.log(`Found ${affectedEmiCount} prematurely completed EMI(s) across ${affectedUserCount} user(s).`);
  console.log(`NO DATA WAS MODIFIED.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
