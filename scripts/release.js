#!/usr/bin/env node

const { parseCliArgs } = require('./common');
const { verifyEnvironment } = require('./verify-environment');
const { verifyKeystore } = require('./verify-keystore');
const { verifyGoogleServices } = require('./verify-google-services');
const { verifyGradle } = require('./verify-gradle');
const { prepareRelease } = require('./prepare-release');
const { buildRelease } = require('./build-release');
const { extractFingerprints } = require('./extract-sha1');
const { printReleaseReport } = require('./release-report');

function main() {
  const options = parseCliArgs();

  console.log('\n' + '#'.repeat(60));
  console.log('🏁 STARTING AUTOMATED ANDROID RELEASE PIPELINE');
  console.log('#'.repeat(60) + '\n');

  // Step 1: Verification
  console.log('--- Phase 1: Environment & Asset Verification ---');
  verifyEnvironment();
  verifyKeystore();
  verifyGoogleServices();
  verifyGradle();

  // Step 2: Preparation & Version Management
  console.log('\n--- Phase 2: Release Preparation & Versioning ---');
  prepareRelease(options);

  // Step 3: Build & APK Archiving
  console.log('\n--- Phase 3: Compilation & APK Archiving ---');
  buildRelease({ ...options, skipPrepare: true });

  // Step 4: Extract Fingerprints
  console.log('\n--- Phase 4: Certificate Fingerprint Extraction ---');
  extractFingerprints();

  // Step 5: Final Release Report
  console.log('\n--- Phase 5: Release Summary Report ---');
  printReleaseReport();

  console.log('#'.repeat(60));
  console.log('🎉 ANDROID RELEASE PIPELINE FINISHED SUCCESSFULLY');
  console.log('#'.repeat(60) + '\n');
}

if (require.main === module) {
  main();
}

module.exports = { main };
