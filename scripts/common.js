const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const APP_DIR = path.join(ANDROID_DIR, 'app');
const KEYSTORE_REL_PATH = 'keystores/expense-tracker-upload-key.keystore';
const KEYSTORE_PATH = path.join(ROOT_DIR, KEYSTORE_REL_PATH);
const GOOGLE_SERVICES_APP_PATH = path.join(APP_DIR, 'google-services.json');
const GOOGLE_SERVICES_ROOT_PATH = path.join(ROOT_DIR, 'google-services.json');
const GRADLE_PROPS_PATH = path.join(ANDROID_DIR, 'gradle.properties');
const BUILD_GRADLE_PATH = path.join(APP_DIR, 'build.gradle');
const APP_JSON_PATH = path.join(ROOT_DIR, 'app.json');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const RELEASES_DIR = path.join(ROOT_DIR, 'releases');
const STATE_FILE_PATH = path.join(ROOT_DIR, '.release-state.json');

const DEFAULT_KEY_ALIAS = 'expense-tracker-upload';
const DEFAULT_STORE_FILE = '../keystores/expense-tracker-upload-key.keystore';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
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
      result[key] = value;
    }
  }
  return result;
}

function getMergedEnvFileVars() {
  const envRelease = parseEnvFile(path.join(ROOT_DIR, '.env.release'));
  const envLocal = parseEnvFile(path.join(ROOT_DIR, '.env.local'));
  const envMain = parseEnvFile(path.join(ROOT_DIR, '.env'));
  // File values win over empty process placeholders; explicit process.env later overlays.
  return {
    ...envMain,
    ...envLocal,
    ...envRelease
  };
}

function getExpoPublicEnv() {
  const merged = getMergedEnvFileVars();
  const expoPublic = {};
  for (const [key, value] of Object.entries(merged)) {
    if (key.startsWith('EXPO_PUBLIC_') && typeof value === 'string' && value.length > 0) {
      expoPublic[key] = value;
    }
  }
  return expoPublic;
}

function loadEnvConfig() {
  const merged = {
    ...getMergedEnvFileVars(),
    ...process.env
  };

  return {
    storePassword: merged.MYAPP_RELEASE_STORE_PASSWORD || '',
    keyPassword: merged.MYAPP_RELEASE_KEY_PASSWORD || '',
    keyAlias: merged.MYAPP_RELEASE_KEY_ALIAS || DEFAULT_KEY_ALIAS,
    storeFile: merged.MYAPP_RELEASE_STORE_FILE || DEFAULT_STORE_FILE,
    expoPublic: getExpoPublicEnv()
  };
}

function failFast({ step, error, why, fix }) {
  console.error('\n' + '='.repeat(60));
  console.error('❌ RELEASE PIPELINE FAILURE');
  console.error('='.repeat(60));
  if (step) console.error(`📌 Step:   ${step}`);
  if (error) console.error(`⚠️ Error:  ${error}`);
  if (why) console.error(`🔍 Why:    ${why}`);
  if (fix) console.error(`💡 Fix:    ${fix}`);
  console.error('='.repeat(60) + '\n');
  process.exit(1);
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {
    version: null,
    skipPrebuild: false,
    clean: false
  };

  for (const arg of args) {
    if (arg.startsWith('--version=')) {
      options.version = arg.split('=')[1].trim();
    } else if (arg === '--skip-prebuild') {
      options.skipPrebuild = true;
    } else if (arg === '--clean') {
      options.clean = true;
    }
  }

  return options;
}

function getCurrentVersion() {
  let appVersion = '1.0.0';
  let appVersionCode = 1;

  if (fs.existsSync(APP_JSON_PATH)) {
    try {
      const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
      if (appJson.expo) {
        if (appJson.expo.version) appVersion = appJson.expo.version;
        if (appJson.expo.android && appJson.expo.android.versionCode) {
          appVersionCode = Number(appJson.expo.android.versionCode) || 1;
        }
      }
    } catch (_) {}
  }

  if (fs.existsSync(BUILD_GRADLE_PATH)) {
    const gradleContent = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
    const vcMatch = gradleContent.match(/versionCode\s+(\d+)/);
    const vnMatch = gradleContent.match(/versionName\s+["']([^"']+)["']/);
    if (vcMatch) {
      const gCode = parseInt(vcMatch[1], 10);
      if (gCode > appVersionCode) appVersionCode = gCode;
    }
    if (vnMatch && !appVersion) {
      appVersion = vnMatch[1];
    }
  }

  return {
    versionName: appVersion,
    versionCode: appVersionCode
  };
}

function updateVersion({ versionName, versionCode }) {
  const current = getCurrentVersion();
  const newVersionName = versionName || current.versionName;
  let newVersionCode = versionCode !== undefined ? versionCode : current.versionCode + 1;

  if (newVersionCode < current.versionCode) {
    failFast({
      step: 'Version Management',
      error: `Cannot decrease versionCode from ${current.versionCode} to ${newVersionCode}`,
      why: 'Android requires versionCode to be strictly monotonically increasing for app updates.',
      fix: `Specify a versionCode >= ${current.versionCode + 1}`
    });
  }

  // 1. Update app.json
  if (fs.existsSync(APP_JSON_PATH)) {
    const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
    if (!appJson.expo) appJson.expo = {};
    appJson.expo.version = newVersionName;
    if (!appJson.expo.android) appJson.expo.android = {};
    appJson.expo.android.versionCode = newVersionCode;
    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
  }

  // 2. Update android/app/build.gradle
  if (fs.existsSync(BUILD_GRADLE_PATH)) {
    let gradleContent = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
    gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`);
    gradleContent = gradleContent.replace(/versionName\s+["'][^"']+["']/, `versionName "${newVersionName}"`);
    fs.writeFileSync(BUILD_GRADLE_PATH, gradleContent, 'utf8');
  }

  // 3. Update package.json
  if (fs.existsSync(PACKAGE_JSON_PATH)) {
    const pkgJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    pkgJson.version = newVersionName;
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');
  }

  return {
    versionName: newVersionName,
    versionCode: newVersionCode
  };
}

function saveReleaseState(data) {
  let existing = {};
  if (fs.existsSync(STATE_FILE_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
    } catch (_) {}
  }
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

function getReleaseState() {
  if (!fs.existsSync(STATE_FILE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

module.exports = {
  ROOT_DIR,
  ANDROID_DIR,
  APP_DIR,
  KEYSTORE_REL_PATH,
  KEYSTORE_PATH,
  GOOGLE_SERVICES_APP_PATH,
  GOOGLE_SERVICES_ROOT_PATH,
  GRADLE_PROPS_PATH,
  BUILD_GRADLE_PATH,
  APP_JSON_PATH,
  PACKAGE_JSON_PATH,
  RELEASES_DIR,
  STATE_FILE_PATH,
  DEFAULT_KEY_ALIAS,
  DEFAULT_STORE_FILE,
  loadEnvConfig,
  failFast,
  parseCliArgs,
  getCurrentVersion,
  updateVersion,
  saveReleaseState,
  getReleaseState,
  getExpoPublicEnv,
  getMergedEnvFileVars
};
