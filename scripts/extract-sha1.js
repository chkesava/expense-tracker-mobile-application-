#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const {
  KEYSTORE_PATH,
  loadEnvConfig,
  failFast,
  saveReleaseState
} = require('./common');

function extractFingerprints() {
  if (!fs.existsSync(KEYSTORE_PATH)) {
    failFast({
      step: 'Extract SHA1/SHA256',
      error: `Keystore file not found at ${KEYSTORE_PATH}`,
      why: 'Cannot extract fingerprints without the release keystore file.',
      fix: 'Ensure keystores/expense-tracker-upload-key.keystore is present.'
    });
  }

  const { storePassword, keyAlias } = loadEnvConfig();
  let cmd = `keytool -list -v -keystore "${KEYSTORE_PATH}" -alias "${keyAlias}"`;
  if (storePassword) {
    cmd += ` -storepass "${storePassword}"`;
  }

  let output = '';
  try {
    output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : error.message;
    failFast({
      step: 'Extract SHA1/SHA256',
      error: 'Keytool execution failed while reading certificate fingerprints.',
      why: stderr.trim(),
      fix: 'Verify keystore password and alias in .env.release or .env.local'
    });
  }

  const sha1Match = output.match(/SHA1:\s*([A-F0-9:]+)/i);
  const sha256Match = output.match(/SHA256:\s*([A-F0-9:]+)/i);

  if (!sha1Match || !sha256Match) {
    failFast({
      step: 'Extract SHA1/SHA256',
      error: 'Could not parse SHA1 or SHA256 from keytool output.',
      why: 'Keytool output format did not match expected fingerprint patterns.',
      fix: 'Run "keytool -list -v -keystore keystores/expense-tracker-upload-key.keystore" manually to inspect.'
    });
  }

  const sha1 = sha1Match[1].trim();
  const sha256 = sha256Match[1].trim();

  saveReleaseState({
    fingerprints: {
      sha1,
      sha256
    }
  });

  return { sha1, sha256 };
}

if (require.main === module) {
  const { sha1, sha256 } = extractFingerprints();
  console.log(`SHA1: ${sha1}`);
  console.log(`SHA256: ${sha256}`);
}

module.exports = { extractFingerprints };
