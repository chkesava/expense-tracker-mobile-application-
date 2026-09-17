#!/usr/bin/env node

/**
 * SPENDLY-45 — report (accountId, statementDate) pairs that already have more
 * than one `creditCardBills` document. Does not merge, rewrite, or delete.
 *
 * Existing duplicates stay until a person merges them. New auto bills use
 * deterministic ids so this should not keep growing after the app ships.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT
 * (same as scripts/backfill-ganesh-admin-count.js).
 *
 * Usage:
 *   node scripts/detect-duplicate-credit-card-bills.js
 *
 * This is detection only. Always read the report before touching production.
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

function findDuplicateCreditCardBills(bills) {
  const groups = new Map();
  for (const bill of bills) {
    if (!bill.id || !bill.accountId || !bill.statementDate) continue;
    const key = `${bill.accountId}:${bill.statementDate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(bill.id);
    } else {
      groups.set(key, {
        accountId: bill.accountId,
        statementDate: bill.statementDate,
        ids: [bill.id],
      });
    }
  }
  return [...groups.values()].filter((group) => group.ids.length > 1);
}

async function main() {
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: loadCredential() });
  const db = getFirestore(app);

  const users = await db.collection("users").listDocuments();
  let usersWithDupes = 0;
  let groupCount = 0;

  for (const userRef of users) {
    const snap = await userRef.collection("creditCardBills").get();
    const bills = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      accountId: docSnap.data().accountId,
      statementDate: docSnap.data().statementDate,
    }));
    const dupes = findDuplicateCreditCardBills(bills);
    if (dupes.length === 0) continue;
    usersWithDupes += 1;
    groupCount += dupes.length;
    console.log(`users/${userRef.id}`);
    for (const group of dupes) {
      console.log(
        `  ${group.accountId} ${group.statementDate}  (${group.ids.length})  ${group.ids.join(", ")}`
      );
    }
  }

  console.log(
    `\n${groupCount} duplicate group(s) across ${usersWithDupes} user(s). No writes.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
