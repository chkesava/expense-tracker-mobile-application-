#!/usr/bin/env node

/**
 * SPENDLY-420 — backfill `stockProfiles` and `holdings.profileId` for holdings
 * written before the Stock Profile split shipped.
 *
 * `createHoldingWithCash`/`executeMockBuy`/`executeMockSell`/CSV import now all
 * resolve a deterministic Stock Profile id from a holding's identity
 * (symbol/yahooSymbol/exchange — see shared/features/portfolio/utils/stockProfile.ts)
 * and upsert that profile alongside every write. Holdings that already existed
 * before this shipped have no `profileId` and no corresponding `stockProfiles`
 * doc yet — this script fills that in, nothing else.
 *
 * Mirrors the matching logic in
 * shared/features/portfolio/utils/stockProfile.ts (stockProfileMatchKey /
 * stockProfileId) in plain JS, the same way scripts/reconcile-portfolio-holdings.js
 * already does for its own authoritative TS source — keep the two in sync.
 *
 * Scope, deliberately narrow:
 *   - Writes `stockProfiles/{profileId}` (merge) for every unique instrument
 *     found across a user's holdings.
 *   - Writes `holdings/{id}.profileId` for every holding missing it.
 *   - Never touches quantity, averageBuyPrice, broker, datePurchased, or any
 *     other position field.
 *   - Never touches portfolioTransactions or investmentCashTransactions —
 *     those already reference holdingId, which this script never changes, so
 *     cash/transaction links survive untouched by construction.
 *   - Never deletes a document, never strips the legacy identity fields a
 *     holding already carries (they stay as a denormalized cache, same as
 *     every other collection in this app that duplicates identity fields).
 *
 * Idempotent: profileId is deterministic, so a second run reports "already
 * migrated, skipped" for every holding and writes nothing new.
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT
 * (same as scripts/backfill-ganesh-admin-count.js).
 *
 * Usage:
 *   node scripts/backfill-stock-profiles.js                 # dry run (default)
 *   node scripts/backfill-stock-profiles.js --user <uid>    # one user only
 *   node scripts/backfill-stock-profiles.js --apply         # write the fixes
 *
 * Always read the dry-run report — and get the user's explicit go-ahead,
 * since this is the shared dev/prod Firebase project with no staging —
 * before passing --apply.
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

/** Mirrors shared/features/portfolio/utils/stockProfile.ts stockProfileMatchKey. */
function matchKey(holding) {
  const isin = holding.isin && String(holding.isin).trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const yahoo = holding.yahooSymbol && String(holding.yahooSymbol).trim().toUpperCase();
  if (yahoo) return `yahoo:${yahoo}`;
  return `sym:${String(holding.exchange ?? "").toUpperCase()}:${String(holding.symbol ?? "").trim().toUpperCase()}`;
}

/** Mirrors shared/features/portfolio/utils/stockProfile.ts hash32/stockProfileId. */
function hash32(value, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function profileId(key) {
  return `profile_${hash32(key, 0x811c9dc5)}${hash32(key, 0x01000193)}`;
}

function profileIdentity(holding) {
  return {
    symbol: holding.symbol,
    yahooSymbol: holding.yahooSymbol,
    name: holding.name,
    exchange: holding.exchange,
    instrumentType: holding.instrumentType,
    ...(holding.sector ? { sector: holding.sector } : {}),
    ...(holding.logoUrl ? { logoUrl: holding.logoUrl } : {}),
    status: "active",
  };
}

async function migrateUser(userRef, { apply }) {
  const holdingsSnap = await userRef.collection("holdings").get();
  if (holdingsSnap.empty) return { profiles: 0, holdingsUpdated: 0, alreadyMigrated: 0 };

  const holdings = holdingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const profilesByKey = new Map();
  const holdingUpdates = [];
  let alreadyMigrated = 0;

  for (const holding of holdings) {
    if (!holding.symbol) continue; // nothing to key off; leave untouched
    const key = matchKey(holding);
    const id = profileId(key);
    if (!profilesByKey.has(key)) {
      profilesByKey.set(key, { id, identity: profileIdentity(holding) });
    }
    if (holding.profileId === id) {
      alreadyMigrated += 1;
      continue;
    }
    holdingUpdates.push({ holdingId: holding.id, profileId: id, symbol: holding.symbol });
  }

  for (const [, profile] of profilesByKey) {
    console.log(`  ${userRef.id}/stockProfiles/${profile.id}  upsert ${profile.identity.symbol} (${profile.identity.exchange})`);
  }
  for (const update of holdingUpdates) {
    console.log(`  ${userRef.id}/holdings/${update.holdingId}  profileId -> ${update.profileId} (${update.symbol})`);
  }

  if (apply) {
    const batch = userRef.firestore.batch();
    for (const [, profile] of profilesByKey) {
      batch.set(userRef.collection("stockProfiles").doc(profile.id), {
        ...profile.identity,
        updatedAt: new Date(),
      }, { merge: true });
    }
    for (const update of holdingUpdates) {
      batch.update(userRef.collection("holdings").doc(update.holdingId), {
        profileId: update.profileId,
      });
    }
    await batch.commit();
  }

  return { profiles: profilesByKey.size, holdingsUpdated: holdingUpdates.length, alreadyMigrated };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const userIndex = process.argv.indexOf("--user");
  const onlyUserId = userIndex >= 0 ? process.argv[userIndex + 1] : null;

  const app = getApps().length ? getApps()[0] : initializeApp({ credential: loadCredential() });
  const db = getFirestore(app);

  const userRefs = onlyUserId
    ? [db.collection("users").doc(onlyUserId)]
    : await db.collection("users").listDocuments();

  let totalProfiles = 0;
  let totalHoldingsUpdated = 0;
  let totalAlreadyMigrated = 0;
  let usersTouched = 0;

  for (const userRef of userRefs) {
    const result = await migrateUser(userRef, { apply });
    if (result.profiles + result.holdingsUpdated > 0) usersTouched += 1;
    totalProfiles += result.profiles;
    totalHoldingsUpdated += result.holdingsUpdated;
    totalAlreadyMigrated += result.alreadyMigrated;
  }

  console.log("");
  console.log(
    `${usersTouched} user(s) affected. ${totalProfiles} unique profile(s), ${totalHoldingsUpdated} holding(s) to backfill, ${totalAlreadyMigrated} already migrated.`
  );
  console.log(apply ? "Applied." : "Dry run — nothing was written. Re-run with --apply to write these changes.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
