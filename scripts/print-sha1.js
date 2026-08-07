#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const KEYSTORE_REL_PATH = 'keystores/expense-tracker-upload-key.keystore';
const KEYSTORE_PATH = path.join(ROOT_DIR, KEYSTORE_REL_PATH);
const ENV_PATH = path.join(ROOT_DIR, '.env');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function printFingerprints() {
  if (!fs.existsSync(KEYSTORE_PATH)) {
    process.exit(1);
  }

  const localEnv = loadEnvFile(ENV_PATH);
  const storePassword = process.env.MYAPP_RELEASE_STORE_PASSWORD || localEnv.MYAPP_RELEASE_STORE_PASSWORD;
  const alias = process.env.MYAPP_RELEASE_KEY_ALIAS || 'expense-tracker-upload';

  let command = `keytool -list -v -keystore "${KEYSTORE_PATH}" -alias "${alias}"`;
  if (storePassword) {
    command += ` -storepass "${storePassword}"`;
  }

  try {
    const output = execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const sha1Match = output.match(/SHA1:\s*([A-F0-9:]+)/i);
    const sha256Match = output.match(/SHA256:\s*([A-F0-9:]+)/i);

    if (!sha1Match || !sha256Match) {
      process.exit(1);
    }

    console.log(`SHA1: ${sha1Match[1]}`);
    console.log(`SHA256: ${sha256Match[1]}`);
  } catch (error) {
    process.exit(1);
  }
}

if (require.main === module) {
  printFingerprints();
}

module.exports = { printFingerprints };
