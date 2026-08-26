#!/usr/bin/env node

/**
 * One-off backfill for `pandals/{id}.adminCount` (GS-014).
 *
 * `adminCount` was added after the Ganesh feature shipped and nothing ever
 * backfilled it. The security rules now tolerate a missing field by reading it
 * as 1 (`currentAdminCount()` / `afterAdminCount()` in `firestore.rules`), so
 * nothing is broken while it is absent — but a pandal that predates the field
 * AND has more than one active admin reads as 1, and demoting either of them is
 * then refused by the last-admin guard. This script writes the true count.
 *
 * It is also safe to run against pandals that already have the field: it
 * recounts from the member documents and only writes where the stored value
 * disagrees.
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (path to a service
 * account JSON) or FIREBASE_SERVICE_ACCOUNT (raw JSON string) — same as
 * scripts/publish-release-metadata.js.
 *
 * Usage:
 *   node scripts/backfill-ganesh-admin-count.js --dry-run
 *   node scripts/backfill-ganesh-admin-count.js
 *
 * Run --dry-run first and read the report. This writes to production data.
 */

const admin = require('firebase-admin');

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return admin.credential.cert(JSON.parse(raw));
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return admin.credential.applicationDefault();
  throw new Error(
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or FIREBASE_SERVICE_ACCOUNT to its contents.'
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  admin.initializeApp({ credential: loadCredential() });
  const db = admin.firestore();

  const pandals = await db.collection('pandals').get();
  if (pandals.empty) {
    console.log('No pandals found. Nothing to do.');
    return;
  }

  let checked = 0;
  let wrong = 0;
  let written = 0;

  for (const pandal of pandals.docs) {
    checked += 1;
    const members = await pandal.ref.collection('members').get();
    const actual = members.docs.filter((doc) => {
      const data = doc.data();
      return data.role === 'admin' && data.status === 'active';
    }).length;

    const storedRaw = pandal.data().adminCount;
    const stored = typeof storedRaw === 'number' ? storedRaw : null;

    if (stored === actual) continue;

    wrong += 1;
    const label = stored === null ? 'missing' : String(stored);
    console.log(`${pandal.id}  stored=${label}  actual=${actual}  (${pandal.data().name ?? 'unnamed'})`);

    // An honest count of zero would lock the pandal out of every member update,
    // because the last-admin guard requires the result to stay >= 1. Report it
    // and skip rather than writing a value that bricks the document.
    if (actual === 0) {
      console.log(`  SKIPPED — this pandal has no active admin. Fix its membership first.`);
      continue;
    }

    if (dryRun) continue;
    await pandal.ref.update({ adminCount: actual });
    written += 1;
  }

  console.log('');
  console.log(`Checked ${checked} pandal(s). ${wrong} disagreed with their member documents.`);
  console.log(dryRun ? 'Dry run — nothing was written.' : `Wrote ${written} update(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
