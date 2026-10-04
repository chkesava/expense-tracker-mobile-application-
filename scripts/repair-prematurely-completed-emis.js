#!/usr/bin/env node

/**
 * SPENDLY-386 — Repair script for prematurely completed EMIs
 *
 * This script identifies EMI items that have been marked as completed (isCompleted = true)
 * but for which the final scheduled payment (expense document) does not exist in the
 * user's expenses subcollection.
 *
 * It will REVERT them back to:
 *   - isCompleted: false
 *   - isActive: true
 *
 * So that the new app logic can correctly wait for their actual billing day to post them.
 *
 * Usage:
 *   node scripts/repair-prematurely-completed-emis.js [--apply]
 *
 * (Run without --apply first to see what will be changed)
 */

const { initializeApp, getApps, applicationDefault, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const APPLY_CHANGES = process.argv.includes("--apply");

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

  if (APPLY_CHANGES) {
    console.log("⚠️  RUNNING IN APPLY MODE. Data WILL be modified. ⚠️\n");
  } else {
    console.log("🔍 RUNNING IN DRY-RUN MODE. No data will be modified. Use --apply to fix.\n");
  }

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
    const batch = db.batch();
    let pendingWrites = 0;

    for (const docSnap of subSnap.docs) {
      const emi = docSnap.data();
      
      // If it doesn't have an end term specified, it shouldn't be completed by this logic
      if (emi.endYear === undefined || emi.endMonth === undefined) continue;

      const expectedDocId = getExpectedDocId(docSnap.id, emi.endYear, emi.endMonth);
      
      // Check if the final term expense exists
      const expenseRef = userRef.collection("expenses").doc(expectedDocId);
      const expenseSnap = await expenseRef.get();

      if (!expenseSnap.exists) {
        if (!userHasAffectedEmis) {
          console.log(`User: ${userRef.id}`);
          userHasAffectedEmis = true;
          affectedUserCount++;
        }
        
        affectedEmiCount++;
        console.log(`  [REVERTING] EMI ID: ${docSnap.id} | Name: "${emi.name}"`);
        console.log(`    Expected final term: ${emi.endMonth}/${emi.endYear}, Billing Day: ${emi.dayOfMonth || "unknown"}`);
        console.log(`    MISSING final expense doc: ${expectedDocId}`);

        if (APPLY_CHANGES) {
          batch.update(docSnap.ref, {
            isCompleted: false,
            isActive: true,
            updatedAt: FieldValue.serverTimestamp()
          });
          pendingWrites++;
        }
      }
    }

    if (APPLY_CHANGES && pendingWrites > 0) {
      await batch.commit();
      console.log(`  ✅ Committed ${pendingWrites} repairs for user ${userRef.id}\n`);
    } else if (userHasAffectedEmis) {
      console.log(); // blank line for spacing
    }
  }

  console.log(`Repair script complete.`);
  console.log(`Found ${affectedEmiCount} prematurely completed EMI(s) across ${affectedUserCount} user(s).`);
  
  if (!APPLY_CHANGES && affectedEmiCount > 0) {
    console.log(`\nTo fix these records, run the script again with the --apply flag:`);
    console.log(`  node scripts/repair-prematurely-completed-emis.js --apply`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
