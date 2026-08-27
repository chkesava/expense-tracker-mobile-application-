#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  GOOGLE_SERVICES_APP_PATH,
  GOOGLE_SERVICES_ROOT_PATH,
  PRODUCTS_DIR,
  failFast,
  saveReleaseState
} = require('./common');

/** The applicationId this build actually targets, for matching the right client[] entry. */
function resolveExpectedPackageName(product) {
  if (!product) return null;
  try {
    const productJson = JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, `${product}.json`), 'utf8'));
    return productJson.package || null;
  } catch (_) {
    return null;
  }
}

function verifyGoogleServices(product) {
  console.log('📄 [Verify 3/4] Verifying Firebase google-services.json...');

  if (!fs.existsSync(GOOGLE_SERVICES_APP_PATH)) {
    // If root exists, explain how to sync or check
    if (fs.existsSync(GOOGLE_SERVICES_ROOT_PATH)) {
      failFast({
        step: 'Verify google-services.json',
        error: 'google-services.json missing in android/app/ (found in root project).',
        why: 'Gradle requires google-services.json at android/app/google-services.json for Firebase compilation.',
        fix: 'Run "npx expo prebuild" or copy google-services.json to android/app/google-services.json.'
      });
    } else {
      failFast({
        step: 'Verify google-services.json',
        error: 'google-services.json not found in android/app/ or project root.',
        why: 'Firebase services (Auth, Notifications, Google Sign-In) require the Google Services configuration file.',
        fix: 'Download google-services.json from your Firebase Console and place it at android/app/google-services.json.'
      });
    }
  }

  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(GOOGLE_SERVICES_APP_PATH, 'utf8'));
  } catch (err) {
    failFast({
      step: 'Verify google-services.json',
      error: 'google-services.json is malformed JSON.',
      why: err.message,
      fix: 'Re-download the google-services.json from Firebase Console.'
    });
  }

  const projectId = parsed.project_info ? parsed.project_info.project_id : 'unknown';
  const clients = Array.isArray(parsed.client) ? parsed.client : [];
  const expectedPackage = resolveExpectedPackageName(product);
  const matchedClient = expectedPackage
    ? clients.find(
        (c) => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name === expectedPackage
      )
    : clients[0];
  const packageName =
    matchedClient && matchedClient.client_info && matchedClient.client_info.android_client_info
      ? matchedClient.client_info.android_client_info.package_name
      : 'unknown';

  console.log(`   ✅ File Present:   android/app/google-services.json`);
  console.log(`   ✅ Firebase Project: ${projectId}`);
  console.log(`   ✅ Package Name:   ${packageName}`);

  if (expectedPackage && !matchedClient) {
    failFast({
      step: 'Verify google-services.json',
      error: `No client entry for applicationId "${expectedPackage}" in google-services.json.`,
      why: `This build targets product "${product}", but google-services.json has no matching Android app registered.`,
      fix: `Register "${expectedPackage}" as an Android app in the Firebase console and re-download google-services.json.`
    });
  }

  saveReleaseState({
    googleServices: {
      found: true,
      projectId,
      packageName,
      path: 'android/app/google-services.json'
    }
  });

  return { verified: true, projectId, packageName };
}

if (require.main === module) {
  verifyGoogleServices();
}

module.exports = { verifyGoogleServices };
