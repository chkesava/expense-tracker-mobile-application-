#!/usr/bin/env node

/**
 * Uploads the signed APK to Firebase Storage and publishes
 * `system_settings/latest_release` so installed apps can download and install
 * the new build in-app.
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (path to a service
 * account JSON) or FIREBASE_SERVICE_ACCOUNT (raw JSON string).
 *
 * Usage:
 *   node scripts/publish-release-metadata.js \
 *     --apk-path=releases/app-release.apk \
 *     --tester-url=https://appdistribution.firebase.dev/i/xxxx \
 *     --notes="Fixed ledger totals" \
 *     --mandatory=false
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  RELEASES_DIR,
  failFast,
  getCurrentVersion,
  getMergedEnvFileVars,
  getReleaseState,
  saveReleaseState
} = require('./common');

const RELEASE_DOC_COLLECTION = 'system_settings';
const RELEASE_DOC_ID = 'latest_release';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    downloadUrl: process.env.RELEASE_DOWNLOAD_URL || '',
    testerUrl: process.env.RELEASE_TESTER_URL || '',
    apkPath: process.env.RELEASE_APK_PATH || '',
    notes: process.env.RELEASE_NOTES || '',
    mandatory: String(process.env.RELEASE_MANDATORY || '').toLowerCase() === 'true',
    versionName: process.env.RELEASE_VERSION_NAME || '',
    versionCode: process.env.RELEASE_VERSION_CODE
      ? Number.parseInt(process.env.RELEASE_VERSION_CODE, 10)
      : null,
    dryRun: false
  };

  for (const arg of args) {
    if (arg.startsWith('--download-url=')) {
      options.downloadUrl = arg.slice('--download-url='.length).trim();
    } else if (arg.startsWith('--tester-url=')) {
      options.testerUrl = arg.slice('--tester-url='.length).trim();
    } else if (arg.startsWith('--apk-path=')) {
      options.apkPath = arg.slice('--apk-path='.length).trim();
    } else if (arg.startsWith('--notes=')) {
      options.notes = arg.slice('--notes='.length).trim();
    } else if (arg.startsWith('--mandatory=')) {
      options.mandatory = arg.slice('--mandatory='.length).trim().toLowerCase() === 'true';
    } else if (arg.startsWith('--version-name=')) {
      options.versionName = arg.slice('--version-name='.length).trim();
    } else if (arg.startsWith('--version-code=')) {
      options.versionCode = Number.parseInt(arg.slice('--version-code='.length).trim(), 10);
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

  return apks
    .map((name) => ({ name, mtime: fs.statSync(path.join(RELEASES_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
}

function resolveLocalApkPath(options) {
  if (options.apkPath && options.apkPath.trim()) {
    return path.resolve(options.apkPath.trim());
  }

  const fallback = path.join(RELEASES_DIR, 'app-release.apk');
  return fs.existsSync(fallback) ? fallback : '';
}

function resolveStorageBucket(serviceAccount) {
  const merged = getMergedEnvFileVars();
  return (
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    merged.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${serviceAccount.project_id}.firebasestorage.app`
  );
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function storageDownloadUrl(bucketName, storagePath, token) {
  const encoded = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

async function uploadApk({ localPath, storagePath, bucketName }) {
  const { getStorage } = require('firebase-admin/storage');
  const token = crypto.randomUUID();
  const bucket = getStorage().bucket(bucketName);

  try {
    await bucket.upload(localPath, {
      destination: storagePath,
      resumable: false,
      public: false,
      metadata: {
        contentType: 'application/vnd.android.package-archive',
        cacheControl: 'private, max-age=0',
        metadata: {
          firebaseStorageDownloadTokens: token
        }
      }
    });
  } catch (e) {
    failFast({
      step: 'Upload APK to Storage',
      error: 'Firebase Storage upload failed.',
      why: e.message,
      fix: 'Grant the CI service account the Storage Admin role and deploy storage.rules.'
    });
  }

  const contentLength = fs.statSync(localPath).size;
  return {
    downloadUrl: storageDownloadUrl(bucket.name, storagePath, token),
    contentLength
  };
}

function loadAdminSdk() {
  let initializeApp;
  let getApps;
  let cert;
  let getFirestore;
  try {
    ({ initializeApp, getApps, cert } = require('firebase-admin/app'));
    ({ getFirestore } = require('firebase-admin/firestore'));
  } catch (_) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'firebase-admin is not installed.',
      why: 'Writing the release document requires the Firebase Admin SDK.',
      fix: 'Run "npm install" so the firebase-admin devDependency is available.'
    });
  }

  if (typeof initializeApp !== 'function' || typeof getFirestore !== 'function' || typeof cert !== 'function') {
    failFast({
      step: 'Publish Release Metadata',
      error: 'firebase-admin modular API is unavailable.',
      why: 'initializeApp/getFirestore/cert could not be loaded from firebase-admin.',
      fix: 'Upgrade firebase-admin to v12+ and keep using the modular imports.'
    });
  }

  return { initializeApp, getApps, cert, getFirestore };
}

async function publishReleaseMetadata(cliOptions = null) {
  const options = cliOptions || parseArgs();
  const version = getCurrentVersion();
  const versionName =
    options.versionName && options.versionName.trim()
      ? options.versionName.trim()
      : version.versionName;
  const versionCode =
    Number.isInteger(options.versionCode) && options.versionCode > 0
      ? options.versionCode
      : version.versionCode;

  const localApk = resolveLocalApkPath(options);
  const storagePath = `releases/${versionCode}/Spendly-${versionName}-${versionCode}.apk`;

  console.log('\n📡 Publishing release metadata to Firestore...');

  if (!localApk && !options.downloadUrl) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'No APK path or download URL supplied.',
      why: 'In-app updates need a Firebase Storage APK (or a direct download URL).',
      fix: 'Pass --apk-path=releases/app-release.apk or --download-url=<url>.'
    });
  }

  const payload = {
    versionName,
    versionCode,
    downloadUrl: options.downloadUrl,
    testerUrl: options.testerUrl || '',
    storagePath: localApk ? storagePath : '',
    notes: options.notes || '',
    mandatory: options.mandatory,
    apkFileName: localApk ? path.basename(localApk) : resolveApkFileName(),
    publishedAt: new Date().toISOString(),
    contentLength: localApk && fs.existsSync(localApk) ? fs.statSync(localApk).size : 0,
    sha256: ''
  };

  if (localApk && fs.existsSync(localApk)) {
    payload.sha256 = await sha256File(localApk);
  }

  console.log(`   Version:     v${payload.versionName} (build ${payload.versionCode})`);
  console.log(`   Mandatory:   ${payload.mandatory}`);
  console.log(`   APK:         ${localApk || payload.apkFileName || 'n/a'}`);
  console.log(`   Storage:     ${payload.storagePath || 'n/a'}`);
  console.log(`   Doc:         ${RELEASE_DOC_COLLECTION}/${RELEASE_DOC_ID}`);

  if (options.dryRun) {
    console.log('\n🧪 Dry run — no Storage upload or Firestore write performed.');
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  }

  const { initializeApp, getApps, cert, getFirestore } = loadAdminSdk();
  const serviceAccount = loadServiceAccount();
  const storageBucket = resolveStorageBucket(serviceAccount);

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
      storageBucket
    });
  }

  if (localApk) {
    if (!fs.existsSync(localApk)) {
      failFast({
        step: 'Upload APK to Storage',
        error: `APK not found at ${localApk}.`,
        why: 'The release publisher uploads that file to Firebase Storage.',
        fix: 'Build the signed APK first, or pass --apk-path to the real file.'
      });
    }

    const uploaded = await uploadApk({
      localPath: localApk,
      storagePath,
      bucketName: storageBucket
    });
    payload.downloadUrl = uploaded.downloadUrl;
    payload.contentLength = uploaded.contentLength;
    payload.storagePath = storagePath;
  }

  if (!payload.downloadUrl && !payload.storagePath) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'Release document is missing a download URL.',
      why: 'Installed apps cannot fetch the APK without storagePath or downloadUrl.',
      fix: 'Pass --apk-path or --download-url.'
    });
  }

  try {
    await getFirestore()
      .collection(RELEASE_DOC_COLLECTION)
      .doc(RELEASE_DOC_ID)
      .set(payload, { merge: true });
  } catch (e) {
    failFast({
      step: 'Publish Release Metadata',
      error: 'Firestore write failed.',
      why: e.message,
      fix: 'Confirm the service account has the "Cloud Datastore User" (or Firestore write) role on this project.'
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
