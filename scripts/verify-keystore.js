#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const {
  KEYSTORE_PATH,
  KEYSTORE_REL_PATH,
  loadEnvConfig,
  failFast,
  saveReleaseState
} = require('./common');

function verifyKeystore() {
  console.log('🔐 [Verify 2/4] Verifying Release Keystore...');

  // 1. Check Keystore File Exists
  if (!fs.existsSync(KEYSTORE_PATH)) {
    failFast({
      step: 'Check Release Keystore Exists',
      error: `Keystore file not found at ${KEYSTORE_PATH}`,
      why: 'Release builds require the designated production upload keystore to sign the APK.',
      fix: `Ensure your permanent release keystore is located at "${KEYSTORE_REL_PATH}".`
    });
  }

  // 2. Load Passwords & Alias
  const { storePassword, keyPassword, keyAlias } = loadEnvConfig();

  if (!storePassword || !keyPassword) {
    failFast({
      step: 'Check Environment Variables (Keystore Passwords)',
      error: 'Release keystore passwords are not defined.',
      why: 'Signing release APKs requires MYAPP_RELEASE_STORE_PASSWORD and MYAPP_RELEASE_KEY_PASSWORD.',
      fix: 'Add MYAPP_RELEASE_STORE_PASSWORD and MYAPP_RELEASE_KEY_PASSWORD to your .env.release or .env.local file.'
    });
  }

  // 3. Validate Keystore with keytool
  try {
    const cmd = `keytool -list -keystore "${KEYSTORE_PATH}" -alias "${keyAlias}" -storepass "${storePassword}"`;
    execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : error.message;
    failFast({
      step: 'Validate Keystore',
      error: 'Failed to access or unlock release keystore using keytool.',
      why: `Keytool verification failed for alias "${keyAlias}". Reason: ${stderr.trim()}`,
      fix: 'Verify that the keystore password, key password, and alias ("expense-tracker-upload") match the keystore.'
    });
  }

  console.log(`   ✅ Keystore Location: ${KEYSTORE_REL_PATH}`);
  console.log(`   ✅ Keystore Alias:    ${keyAlias}`);
  console.log('   ✅ Password Verified: Keystore unlocked successfully');

  saveReleaseState({
    keystore: {
      found: true,
      path: KEYSTORE_REL_PATH,
      alias: keyAlias,
      validated: true
    }
  });

  return { verified: true, keyAlias };
}

if (require.main === module) {
  verifyKeystore();
}

module.exports = { verifyKeystore };
