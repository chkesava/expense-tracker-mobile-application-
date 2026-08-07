const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadEnvConfig, ROOT_DIR, ANDROID_DIR, RELEASES_DIR } = require('./common');

console.log('🏁 Starting direct release build runner...');

const cfg = loadEnvConfig();
const env = {
  ...process.env,
  MYAPP_RELEASE_STORE_PASSWORD: cfg.storePassword,
  MYAPP_RELEASE_KEY_PASSWORD: cfg.keyPassword,
  ORG_GRADLE_PROJECT_MYAPP_RELEASE_STORE_PASSWORD: cfg.storePassword,
  ORG_GRADLE_PROJECT_MYAPP_RELEASE_KEY_PASSWORD: cfg.keyPassword
};

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

console.log('▶️ Executing Gradle assembleRelease --no-daemon...');
const result = spawnSync(gradlew, ['assembleRelease', '--no-daemon', '--stacktrace'], {
  cwd: ANDROID_DIR,
  env,
  stdio: 'inherit',
  shell: true
});

if (result.status !== 0) {
  console.error(`❌ Gradle assembleRelease failed with exit code ${result.status}`);
  process.exit(result.status || 1);
}

console.log('✅ Gradle assembleRelease completed successfully!');

const rawApk = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
console.log('Checking for generated APK at:', rawApk);

if (!fs.existsSync(rawApk)) {
  console.error('❌ Error: app-release.apk was not found at:', rawApk);
  process.exit(1);
}

const stat = fs.statSync(rawApk);
const sizeMb = (stat.size / 1024 / 1024).toFixed(2);
console.log(`📦 Generated APK Size: ${sizeMb} MB`);

if (!fs.existsSync(RELEASES_DIR)) {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

const targetApk = path.join(RELEASES_DIR, 'ExpenseTracker-v1.0.0-release.apk');
fs.copyFileSync(rawApk, targetApk);
console.log('🎉 Successfully copied APK to releases directory:', targetApk);
console.log('📁 Contents of releases folder:', fs.readdirSync(RELEASES_DIR));
