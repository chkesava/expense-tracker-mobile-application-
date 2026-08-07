#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  ROOT_DIR,
  KEYSTORE_REL_PATH,
  getReleaseState,
  getCurrentVersion
} = require('./common');
const { extractFingerprints } = require('./extract-sha1');

function printReleaseReport() {
  const state = getReleaseState();
  const version = getCurrentVersion();

  // Ensure fingerprints are available
  let fingerprints = state.fingerprints;
  if (!fingerprints || !fingerprints.sha1) {
    try {
      fingerprints = extractFingerprints();
    } catch (_) {
      fingerprints = { sha1: 'Not Available', sha256: 'Not Available' };
    }
  }

  const env = state.environment || {};
  const build = state.build || {};
  const gradle = state.gradle || {};
  const keystore = state.keystore || {};
  const googleServices = state.googleServices || {};

  const javaVer = env.java || 'OpenJDK 17 / 21';
  const gradleStatus = env.gradle || 'Gradle 9.x Ready';
  const sdkPath = env.androidSdk || process.env.ANDROID_HOME || 'Android SDK Configured';
  const expoVer = env.expo || '~57.0.10';
  const rnVer = env.reactNative || '0.86.2';

  const keystoreFound = keystore.found || fs.existsSync(path.join(ROOT_DIR, KEYSTORE_REL_PATH)) ? 'Yes' : 'No';
  const releaseConfigValid = gradle.buildGradleValid !== false ? 'Yes' : 'No';
  const gradlePropsValid = gradle.gradlePropertiesValid !== false ? 'Yes' : 'No';
  const googleServicesFound = googleServices.found !== false ? 'Yes' : 'No';

  const apkGenerated = build.rawApkPath ? 'Yes' : (fs.existsSync(path.join(ROOT_DIR, 'android/app/build/outputs/apk/release/app-release.apk')) ? 'Yes' : 'Pending');
  const apkLocation = build.archivedApkPath || (build.rawApkPath || 'android/app/build/outputs/apk/release/app-release.apk');
  const apkSize = build.apkSizeMb || 'Calculated after build';
  const buildTime = build.buildTime || 'N/A';
  const sha1 = fingerprints.sha1 || 'N/A';
  const sha256 = fingerprints.sha256 || 'N/A';

  console.log('\n======================================');
  console.log('Android Release Summary');
  console.log('======================================');
  console.log('Environment');
  console.log(`  Java:                  ${javaVer}`);
  console.log(`  Gradle:                ${gradleStatus}`);
  console.log(`  Android SDK:           ${sdkPath}`);
  console.log(`  Expo:                  ${expoVer}`);
  console.log(`  React Native:          ${rnVer}`);
  console.log('\nRelease Signing');
  console.log(`  Keystore Found:        ${keystoreFound} (${KEYSTORE_REL_PATH})`);
  console.log(`  Release Config Valid:  ${releaseConfigValid}`);
  console.log(`  Gradle Props Valid:    ${gradlePropsValid}`);
  console.log(`  google-services Found: ${googleServicesFound}`);
  console.log('\nAPK Details');
  console.log(`  Version:               v${version.versionName} (build ${version.versionCode})`);
  console.log(`  APK Generated:         ${apkGenerated}`);
  console.log(`  APK Location:          ${apkLocation}`);
  console.log(`  APK Size:              ${apkSize}`);
  console.log(`  SHA1:                  ${sha1}`);
  console.log(`  SHA256:                ${sha256}`);
  console.log(`  Build Time:            ${buildTime}`);
  console.log('======================================\n');
}

if (require.main === module) {
  printReleaseReport();
}

module.exports = { printReleaseReport };
