#!/usr/bin/env node

const {
  parseCliArgs,
  getCurrentVersion,
  updateVersion,
  saveReleaseState,
  loadEnvConfig
} = require('./common');
const { verifyEnvironment } = require('./verify-environment');
const { verifyKeystore } = require('./verify-keystore');
const { verifyGoogleServices } = require('./verify-google-services');
const { verifyGradle } = require('./verify-gradle');

function prepareRelease(cliOptions = null) {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 [PHASE 1] PREPARING ANDROID RELEASE ENVIRONMENT');
  console.log('='.repeat(60) + '\n');

  const options = cliOptions || parseCliArgs();

  // 1. Run full verification suite
  verifyEnvironment();
  verifyKeystore();
  verifyGoogleServices();
  verifyGradle();

  // 2. Version Management
  console.log('\n📦 Managing Application Version & Build Code...');
  const current = getCurrentVersion();
  const targetVersionName = options.version || current.versionName;
  const targetVersionCode = current.versionCode + 1;

  const versionResult = updateVersion({
    versionName: targetVersionName,
    versionCode: targetVersionCode
  });

  console.log(`   📌 Previous Version: ${current.versionName} (build ${current.versionCode})`);
  console.log(`   ✨ Release Version:  ${versionResult.versionName} (build ${versionResult.versionCode})`);
  console.log('   ✅ Synchronized version in app.json, build.gradle, and package.json');

  const envConfig = loadEnvConfig();

  saveReleaseState({
    version: versionResult,
    preparedAt: new Date().toISOString()
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ RELEASE PREPARATION COMPLETED SUCCESSFULLY');
  console.log('='.repeat(60) + '\n');

  return {
    version: versionResult,
    envConfig
  };
}

if (require.main === module) {
  prepareRelease();
}

module.exports = { prepareRelease };
