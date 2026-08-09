#!/usr/bin/env node

/**
 * Publishes the latest release metadata to Firestore so installed apps can
 * detect a newer build and prompt the user to update.
 *
 * Document: system_settings/latest_release
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (path to a service
 * account JSON) or FIREBASE_SERVICE_ACCOUNT (raw JSON string).
 *
 * Usage:
 *   node scripts/publish-release-metadata.js \
 *     --download-url=https://appdistribution.firebase.dev/i/xxxx \
 *     --notes="Fixed ledger totals" \
 *     --mandatory=false
 */

const fs = require('fs');
const path = require('path');
const {
  RELEASES_DIR,
  failFast,
  getCurrentVersion,
  getReleaseState,
  saveReleaseState
} = require('./common');

const RELEASE_DOC_COLLECTION = 'system_settings';
const RELEASE_DOC_ID = 'latest_release';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    downloadUrl: process.env.RELEASE_DOWNLOAD_URL || '',
    notes: process.env.RELEASE_NOTES || '',
    mandatory: String(process.env.RELEASE_MANDATORY || '').toLowerCase() === 'true',
    dryRun: false
  };

  for (const arg of args) {
    if (arg.startsWith('--download-url=')) {
      options.downloadUrl = arg.slice('--download-url='.length).trim();
    } else if (arg.startsWith('--notes=')) {
      options.notes = arg.slice('--notes='.length).trim();
    } else if (arg.startsWith('--mandatory=')) {
      options.mandatory = arg.slice('--mandatory='.length).trim().toLowerCase() === 'true';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) {
    try {
      return JSON.parse(inline);
    } catch (e) {
      failFast({
        step: 'Load Service Account',
        error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON.',
        why: e.message,
        fix: 'Store the full service account JSON (including braces) in the secret.'
      });
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && fs.existsSync(credPath)) {
    try {
      return JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch (e) {
      failFast({
        step: 'Load Service Account',
        error: `Service account file at ${credPath} is not valid JSON.`,
        why: e.message,
        fix: 'Re-download the key from Google Cloud Console (IAM → Service Accounts → Keys).'
      });
    }
  }

  failFast({
    step: 'Load Service Account',
    error: 'No Firebase service account credentials found.',
    why: 'Neither FIREBASE_SERVICE_ACCOUNT nor a readable GOOGLE_APPLICATION_CREDENTIALS file was provided.',
    fix: 'Set the FIREBASE_SERVICE_ACCOUNT secret to the service account JSON contents.'
  });

  return null;
}

function resolveApkFileName() {
  const state = getReleaseState();
  if (state.build && state.build.archivedApkPath) {
    return path.basename(state.build.archivedApkPath);
  }

  if (!fs.existsSync(RELEASES_DIR)) return '';

  const apks = fs
    .readdirSync(RELEASES_DIR)
    .filter((name) => name.endsWith('.apk') && name !== 'app-release.apk');

  if (apks.length === 0) return '';

  // Newest archived APK wins when several builds share the folder.
  return apks
    .map((name) => ({ name, mtime: fs.statSync(path.join(RELEASES_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

async function publishReleaseMetadata(cliOptions = null) {
  const options = cliOptions || parseArgs();
  const version = getCurrentVersion();

  console.log('\n📡 Publishing release metadata to Firestore...');

  if (!options.downloadUrl) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'No download URL supplied.',
      why: 'The in-app update prompt needs a link for users to fetch the new APK.',
      fix: 'Pass --download-url=<url> or set RELEASE_DOWNLOAD_URL.'
    });
  }

  const payload = {
    versionName: version.versionName,
    versionCode: version.versionCode,
    downloadUrl: options.downloadUrl,
    notes: options.notes || '',
    mandatory: options.mandatory,
    apkFileName: resolveApkFileName(),
    publishedAt: new Date().toISOString()
  };

  console.log(`   Version:     v${payload.versionName} (build ${payload.versionCode})`);
  console.log(`   Mandatory:   ${payload.mandatory}`);
  console.log(`   APK:         ${payload.apkFileName || 'n/a'}`);
  console.log(`   Doc:         ${RELEASE_DOC_COLLECTION}/${RELEASE_DOC_ID}`);

  if (options.dryRun) {
    console.log('\n🧪 Dry run — no Firestore write performed.');
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (_) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'firebase-admin is not installed.',
      why: 'Writing the release document requires the Firebase Admin SDK.',
      fix: 'Run "npm install" so the firebase-admin devDependency is available.'
    });
  }

  const serviceAccount = loadServiceAccount();

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }

  try {
    await admin
      .firestore()
      .collection(RELEASE_DOC_COLLECTION)
      .doc(RELEASE_DOC_ID)
      .set(payload, { merge: true });
  } catch (e) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'Firestore write failed.',
      why: e.message,
      fix: 'Confirm the service account has the "Cloud Datastore User" role on this project.'
    });
  }

  saveReleaseState({ published: payload });

  console.log('   ✅ Release metadata published. Installed apps will prompt to update.\n');
  return payload;
}

if (require.main === module) {
  publishReleaseMetadata()
    .then(() => process.exit(0))
    .catch((e) => {
      failFast({
        step: 'Publish Release Metadata',
        error: 'Unexpected failure while publishing release metadata.',
        why: e && e.message ? e.message : String(e),
        fix: 'Review the stack trace above and re-run the step.'
      });
    });
}

module.exports = { publishReleaseMetadata, RELEASE_DOC_COLLECTION, RELEASE_DOC_ID };
