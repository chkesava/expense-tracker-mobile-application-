#!/usr/bin/env node
/**
 * SPENDLY-175: builds "Spendly Test", a local APK that talks only to the
 * Firebase Local Emulator Suite on this machine. It installs next to the real
 * Spendly (application id `com.example.expensetracker.localtest`) and never
 * touches production Firebase, Netlify, Supabase or any other backend.
 *
 *   npm run android:test-build            # emulator host 127.0.0.1 (adb reverse)
 *   npm run android:test-build -- --host=192.168.1.20
 *   npm run android:test-build -- --prebuild   # force a fresh android/
 *
 * Prebuild wipes android/ and forces a full native recompile (about 25
 * minutes), so it only runs when android/ is not already the test variant,
 * or with --prebuild. Use --prebuild after changing app.config.js, plugins
 * or native dependencies; JS/UI changes only need the fast path.
 *
 * Steps:
 *   1. expo prebuild for the Expense product with the emulator flag. The
 *      config turns into the test app (app.config.js).
 *   2. Re-apply release signing (scripts/verify-gradle.js), because prebuild
 *      regenerates android/.
 *   3. gradlew assembleRelease, with keystore passwords from .env passed in the
 *      environment and never printed.
 *   4. Copy the APK to dist/Spendly-Test.apk.
 *
 * `.env` is NOT loaded into the bundle (EXPO_NO_DOTENV=1), so the test APK
 * does not even contain the production Firebase keys. Afterwards android/ is
 * the test variant; the release scripts refuse to build from it
 * (assertNotLocalTestBuild) until it is regenerated. CI always prebuilds its
 * own, so releases are unaffected.
 *
 * See docs/LOCAL_TEST_MODE.md.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  ROOT_DIR,
  ANDROID_DIR,
  LOCAL_TEST_ENV_KEY,
  LOCAL_TEST_PACKAGE_SUFFIX,
  loadEnvConfig,
  failFast,
} = require('./common');
const { verifyGradle } = require('./verify-gradle');

const DEFAULT_HOST = '127.0.0.1';
const OUTPUT_APK = path.join(ROOT_DIR, 'dist', 'Spendly-Test.apk');

function parseHost(argv) {
  const arg = argv.find((a) => a.startsWith('--host='));
  const host = arg ? arg.slice('--host='.length).trim() : DEFAULT_HOST;
  if (!/^[a-zA-Z0-9.-]+$/.test(host)) {
    failFast({ step: 'Parse --host', error: `Invalid host "${host}"`, fix: 'Pass an IP or hostname, e.g. --host=127.0.0.1' });
  }
  return host;
}

/** The environment for prebuild and gradle: only what the test app needs. */
function testBuildEnv(host) {
  const signing = loadEnvConfig();
  if (!signing.storePassword || !signing.keyPassword) {
    failFast({
      step: 'Load signing',
      error: 'MYAPP_RELEASE_STORE_PASSWORD / MYAPP_RELEASE_KEY_PASSWORD not found',
      fix: 'Keep them in .env, where the release pipeline reads them.',
    });
  }
  const buildEnv = { ...process.env };
  // Drop anything EXPO_PUBLIC_* inherited from the shell, then set ours.
  for (const key of Object.keys(buildEnv)) {
    if (key.startsWith('EXPO_PUBLIC_')) delete buildEnv[key];
  }
  return {
    ...buildEnv,
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_PRODUCT: 'expense',
    [LOCAL_TEST_ENV_KEY]: host,
    MYAPP_RELEASE_STORE_PASSWORD: signing.storePassword,
    MYAPP_RELEASE_KEY_PASSWORD: signing.keyPassword,
    MYAPP_RELEASE_KEY_ALIAS: signing.keyAlias,
  };
}

/** True when android/ was generated for the *.localtest app. */
function isTestVariantAndroidDir() {
  const gradlePath = path.join(ANDROID_DIR, 'app', 'build.gradle');
  if (!fs.existsSync(gradlePath)) return false;
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  return new RegExp(`applicationId\\s+['"][^'"]+\\${LOCAL_TEST_PACKAGE_SUFFIX}['"]`).test(gradle);
}

function run(command, cwd, env) {
  console.log(`\n> ${command}`);
  execSync(command, { cwd, env, stdio: 'inherit' });
}

function main() {
  const argv = process.argv.slice(2);
  const host = parseHost(argv);
  const env = testBuildEnv(host);

  console.log(`\nBuilding Spendly Test against the Firebase emulator at ${host}`);

  if (argv.includes('--prebuild') || !isTestVariantAndroidDir()) {
    run('npx expo prebuild --platform android --no-install', ROOT_DIR, env);
  } else {
    console.log('android/ is already the test variant: skipping prebuild (pass --prebuild to force one).');
  }
  verifyGradle();

  const buildGradle = fs.readFileSync(path.join(ANDROID_DIR, 'app', 'build.gradle'), 'utf8');
  if (!new RegExp(`applicationId\\s+['"][^'"]+\\${LOCAL_TEST_PACKAGE_SUFFIX}['"]`).test(buildGradle)) {
    failFast({
      step: 'Check test application id',
      error: `android/app/build.gradle does not use a *${LOCAL_TEST_PACKAGE_SUFFIX} application id`,
      why: 'The test app must install next to the real Spendly, never over it.',
      fix: 'Check applyLocalTestBuild in app.config.js.',
    });
  }

  // Absolute path: some Windows shells don't search the working directory.
  const gradlew = path.join(ANDROID_DIR, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  // Stale daemons from earlier builds, and prebuild's default 512 MB
  // metaspace, can fail a fresh project; stop them and give this build room.
  try {
    run(`"${gradlew}" --stop`, ANDROID_DIR, env);
  } catch {
    // No daemon running.
  }
  run(
    `"${gradlew}" assembleRelease --no-daemon "-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m"`,
    ANDROID_DIR,
    env
  );

  const apk = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (!fs.existsSync(apk)) {
    failFast({ step: 'Locate APK', error: `No APK at ${apk}` });
  }
  fs.mkdirSync(path.dirname(OUTPUT_APK), { recursive: true });
  fs.copyFileSync(apk, OUTPUT_APK);

  console.log(`\nSpendly Test APK: ${path.relative(ROOT_DIR, OUTPUT_APK)}`);
  console.log('Next: npm run emulators:local, npm run device:reverse, then');
  console.log(`      adb install -r ${path.relative(ROOT_DIR, OUTPUT_APK)}`);
}

if (require.main === module) {
  main();
}

module.exports = { parseHost, testBuildEnv, isTestVariantAndroidDir };
