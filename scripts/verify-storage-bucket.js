#!/usr/bin/env node

/**
 * Fail before the long APK build if Firebase Storage is not initialized.
 * A missing bucket is what let App Distribution email testers while in-app
 * updates never learned about the new version.
 */

const { failFast } = require('./common');
const {
  loadServiceAccount,
  loadAdminSdk,
  assertStorageBucket
} = require('./publish-release-metadata');

async function verifyStorageBucket() {
  console.log('\n📦 Verifying Firebase Storage bucket...');

  const { initializeApp, getApps, cert } = loadAdminSdk();
  const serviceAccount = loadServiceAccount();

  let alreadyInitialized = false;
  try {
    const apps = typeof getApps === 'function' ? getApps() : [];
    alreadyInitialized = Array.isArray(apps) && apps.length > 0;
  } catch (_) {
    alreadyInitialized = false;
  }

  if (!alreadyInitialized) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
    });
  }

  await assertStorageBucket(serviceAccount);
}

if (require.main === module) {
  verifyStorageBucket()
    .then(() => process.exit(0))
    .catch((e) => {
      failFast({
        step: 'Verify Firebase Storage',
        error: 'Could not verify the Storage bucket.',
        why: e && e.message ? e.message : String(e),
        fix: 'Open https://console.firebase.google.com/project/expenseapp-27f94/storage and click Get Started.'
      });
    });
}

module.exports = { verifyStorageBucket };
