#!/usr/bin/env node

/**
 * SPENDLY-36 — copy auto-id `paymentRequests` and `splitPublicShares` onto
 * documents whose id is the slug, then delete the auto-id originals.
 *
 * Public pages now `get` by slug. Links already in circulation still point at
 * auto-id docs that only a slug *query* can find, and that query is about to
 * be denied. Run this before deploying the new rules.
 *
 * Also rewrites:
 *   - `splits.participants[].paymentRequestId` when it stored the auto-id
 *   - `splits.publicShareId` when it stored the auto-id
 *   - `splitShareClaims` whose document id / `shareId` used the auto-id
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT
 * (same as scripts/backfill-ganesh-admin-count.js).
 *
 * Usage:
 *   node scripts/backfill-slug-doc-ids.js --dry-run
 *   node scripts/backfill-slug-doc-ids.js
 *
 * Always dry-run first. This writes to production (expenseapp-27f94).
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

function claimDocId(shareId, participantKey) {
  return `${shareId}__${participantKey}`;
}

async function backfillCollection(db, name, dryRun) {
  const snap = await db.collection(name).get();
  const mapping = {};
  let already = 0;
  let copied = 0;
  let conflicts = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const slug = docSnap.data().slug;
    if (typeof slug !== "string" || slug.length < 6) {
      skipped += 1;
      console.log(`${name}/${docSnap.id}  skip (missing/short slug)`);
      continue;
    }
    if (docSnap.id === slug) {
      already += 1;
      continue;
    }

    const target = db.collection(name).doc(slug);
    const existing = await target.get();
    if (existing.exists) {
      conflicts += 1;
      console.log(`${name}/${docSnap.id}  conflict: ${slug} already exists`);
      continue;
    }

    mapping[docSnap.id] = slug;
    console.log(`${name}/${docSnap.id}  ->  ${slug}`);
    if (dryRun) {
      copied += 1;
      continue;
    }
    await target.set(docSnap.data());
    await docSnap.ref.delete();
    copied += 1;
  }

  console.log(
    `${name}: already=${already} copied=${copied} conflicts=${conflicts} skipped=${skipped}`
  );
  return mapping;
}

async function rewriteSplitPointers(db, paymentMap, shareMap, dryRun) {
  if (Object.keys(paymentMap).length === 0 && Object.keys(shareMap).length === 0) {
    return;
  }

  const splits = await db.collection("splits").get();
  let patched = 0;

  for (const split of splits.docs) {
    const data = split.data();
    const updates = {};
    const participants = Array.isArray(data.participants) ? data.participants : [];
    let participantsChanged = false;
    const nextParticipants = participants.map((p) => {
      const oldId = p && p.paymentRequestId;
      if (oldId && paymentMap[oldId]) {
        participantsChanged = true;
        return { ...p, paymentRequestId: paymentMap[oldId] };
      }
      return p;
    });
    if (participantsChanged) updates.participants = nextParticipants;

    const oldShare = data.publicShareId;
    if (oldShare && shareMap[oldShare]) {
      updates.publicShareId = shareMap[oldShare];
    }

    if (Object.keys(updates).length === 0) continue;
    patched += 1;
    console.log(`splits/${split.id}  ${Object.keys(updates).join(",")}`);
    if (!dryRun) await split.ref.update(updates);
  }

  console.log(`splits patched: ${patched}`);
}

async function rewriteClaims(db, shareMap, dryRun) {
  const oldIds = Object.keys(shareMap);
  if (oldIds.length === 0) return;

  const claims = await db.collection("splitShareClaims").get();
  let copied = 0;
  let skipped = 0;

  for (const claim of claims.docs) {
    const data = claim.data();
    const oldShareId = data.shareId;
    const newShareId = oldShareId && shareMap[oldShareId];
    if (!newShareId) continue;

    const participantKey = data.participantKey;
    if (typeof participantKey !== "string" || !participantKey) {
      skipped += 1;
      console.log(`splitShareClaims/${claim.id}  skip (no participantKey)`);
      continue;
    }

    const newId = claimDocId(newShareId, participantKey);
    const target = db.collection("splitShareClaims").doc(newId);
    console.log(`splitShareClaims/${claim.id}  ->  ${newId}`);
    if (dryRun) {
      copied += 1;
      continue;
    }
    await target.set({ ...data, shareId: newShareId });
    await claim.ref.delete();
    copied += 1;
  }

  console.log(`splitShareClaims rewritten: ${copied} skipped=${skipped}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "DRY RUN — no writes" : "LIVE — writing to Firestore");

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: loadCredential() });
  const db = getFirestore(app);

  const paymentMap = await backfillCollection(db, "paymentRequests", dryRun);
  const shareMap = await backfillCollection(db, "splitPublicShares", dryRun);
  await rewriteSplitPointers(db, paymentMap, shareMap, dryRun);
  await rewriteClaims(db, shareMap, dryRun);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
