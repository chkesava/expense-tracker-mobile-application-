#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  ROOT_DIR,
  ANDROID_DIR,
  RELEASES_DIR,
  loadEnvConfig,
  getCurrentVersion,
  parseCliArgs,
  failFast,
  saveReleaseState
} = require('./common');
const { prepareRelease } = require('./prepare-release');

function runCommand(command, cwd, extraEnv = {}, allowFailure = false) {
  console.log(`\n> [EXEC] ${command}`);
  try {
    execSync(command, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...extraEnv
      }
    });
    return true;
  } catch (err) {
    if (allowFailure) {
      console.warn(`⚠️ Warning: Command "${command}" had a non-zero exit code. Continuing...`);
      return false;
    }
    failFast({
      step: `Execute Command: ${command}`,
      error: `Command failed with exit code ${err.status || 1}`,
      why: err.message,
      fix: 'Review the terminal logs above to identify the build issue.'
    });
  }
}

function sanitizeFutureTimestamps(targetDir) {
  const now = Date.now();
  const safeSeconds = (now - 10000) / 1000;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '.git') walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs > now) {
              fs.utimesSync(fullPath, safeSeconds, safeSeconds);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
  walk(targetDir);
}

function purgeAllCxx(targetDir) {
  function cleanCxxRecursive(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '.cxx') {
            try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch (_) {}
          } else if (entry.name !== '.git' && entry.name !== 'build') {
            cleanCxxRecursive(fullPath);
          }
        }
      }
    } catch (_) {}
  }
  cleanCxxRecursive(targetDir);
}

function patchCMakeLists(targetDir) {
  function patchRecursive(dir) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== '.git' && entry.name !== '.cxx') {
          patchRecursive(fullPath);
        } else if (entry.isFile() && entry.name === 'CMakeLists.txt') {
          try {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            if (content.includes('CONFIGURE_DEPENDS')) {
              content = content.replace(/CONFIGURE_DEPENDS\s+/g, '');
              modified = true;
            }
            if (content.includes('project(') && !content.includes('CMAKE_EXPORT_COMPILE_COMMANDS')) {
              content = content.replace(/(project\([^)]+\))/, '$1\nset(CMAKE_EXPORT_COMPILE_COMMANDS OFF)\n');
              modified = true;
            }
            if (modified) {
              fs.writeFileSync(fullPath, content, 'utf8');
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
  patchRecursive(path.join(targetDir, 'node_modules'));
}

function getUniqueReleaseApkPath(baseName) {
  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
  }

  let finalName = `${baseName}.apk`;
  let targetPath = path.join(RELEASES_DIR, finalName);
  let counter = 1;

  while (fs.existsSync(targetPath)) {
    finalName = `${baseName}-${counter}.apk`;
    targetPath = path.join(RELEASES_DIR, finalName);
    counter++;
  }

  return { targetPath, fileName: finalName };
}

function buildRelease(cliOptions = null) {
  const startTime = Date.now();
  const options = cliOptions || parseCliArgs();

  console.log('\n' + '='.repeat(60));
  console.log('🏗️  [PHASE 2] COMPILING ANDROID RELEASE APK');
  console.log('='.repeat(60) + '\n');

  // Step 1: Ensure Release is Prepared & Verified
  if (!options.skipPrepare) {
    prepareRelease(options);
  }

  const { storePassword, keyPassword, expoPublic } = loadEnvConfig();
  const version = getCurrentVersion();
  const isWindows = process.platform === 'win32';
  const gradlewCmd = isWindows ? 'gradlew.bat' : './gradlew';

  // Step 2: Run Expo Prebuild if required
  const androidExists = fs.existsSync(ANDROID_DIR);
  if (!androidExists && !options.skipPrebuild) {
    console.log('\n🔄 Running Expo Prebuild...');
    runCommand('npx expo prebuild --no-install', ROOT_DIR, expoPublic);
    console.log('✅ Expo prebuild completed successfully.');
  } else if (androidExists) {
    console.log('ℹ️  Native Android directory present. Skipping prebuild.');
  } else {
    console.log('ℹ️  --skip-prebuild set. Expecting native Android files to already exist.');
  }

  const gradleEnv = {
    ...expoPublic,
    MYAPP_RELEASE_STORE_PASSWORD: storePassword,
    MYAPP_RELEASE_KEY_PASSWORD: keyPassword,
    ORG_GRADLE_PROJECT_MYAPP_RELEASE_STORE_PASSWORD: storePassword,
    ORG_GRADLE_PROJECT_MYAPP_RELEASE_KEY_PASSWORD: keyPassword
  };

  // Windows MAX_PATH (260): Cursor sandbox Gradle caches are too deep for CMake/ninja.
  // Force a short local cache for native builds.
  if (isWindows) {
    const shortGradleHome = 'C:\\g';
    const shortTemp = 'C:\\t';
    try { fs.mkdirSync(shortGradleHome, { recursive: true }); } catch (_) {}
    try { fs.mkdirSync(shortTemp, { recursive: true }); } catch (_) {}
    gradleEnv.GRADLE_USER_HOME = shortGradleHome;
    gradleEnv.TEMP = shortTemp;
    gradleEnv.TMP = shortTemp;
    gradleEnv.TMPDIR = shortTemp;
    console.log(`\n🧰 Using short Windows Gradle home: ${shortGradleHome}`);
  }

  const expoPublicCount = Object.keys(expoPublic).length;
  console.log(`\n🔐 Injecting ${expoPublicCount} EXPO_PUBLIC_* env var(s) into release bundle process.`);
  if (!expoPublic.EXPO_PUBLIC_FIREBASE_API_KEY) {
    console.warn('⚠️  EXPO_PUBLIC_FIREBASE_API_KEY missing — Firebase may not work in this APK.');
  }
  if (!expoPublic.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    console.log('ℹ️  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID not set — AuthProvider uses built-in Web client ID fallback.');
  }

  console.log('\n🧹 Preparing CMake caches and cleaning native modules...');
  purgeAllCxx(ROOT_DIR);
  sanitizeFutureTimestamps(ROOT_DIR);
  patchCMakeLists(ROOT_DIR);

  runCommand(`${gradlewCmd} --stop`, ANDROID_DIR, {}, true);

  if (options.clean) {
    console.log('\n🧹 Performing Gradle clean...');
    runCommand(`${gradlewCmd} clean`, ANDROID_DIR, gradleEnv, true);
    runCommand(`${gradlewCmd} --stop`, ANDROID_DIR, {}, true);
    purgeAllCxx(ROOT_DIR);
    sanitizeFutureTimestamps(ROOT_DIR);
  }

  console.log('\n⚙️  Assembling Production Release APK...');
  let assembleSuccess = runCommand(`${gradlewCmd} assembleRelease --no-daemon`, ANDROID_DIR, gradleEnv, true);

  if (!assembleSuccess) {
    console.log('\n⚠️ Retrying build with fresh daemon and cache clean...');
    runCommand(`${gradlewCmd} --stop`, ANDROID_DIR, {}, true);
    purgeAllCxx(ROOT_DIR);
    sanitizeFutureTimestamps(ROOT_DIR);
    patchCMakeLists(ROOT_DIR);
    runCommand(`${gradlewCmd} clean`, ANDROID_DIR, gradleEnv, true);
    runCommand(`${gradlewCmd} --stop`, ANDROID_DIR, {}, true);
    purgeAllCxx(ROOT_DIR);
    sanitizeFutureTimestamps(ROOT_DIR);
    console.log('\n⚙️  Retrying Assembling Production Release APK...');
    runCommand(`${gradlewCmd} assembleRelease --no-daemon`, ANDROID_DIR, gradleEnv);
  }

  // Step 4: Verify APK Generated
  const rawApkRelPath = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  const rawApkAbsPath = path.join(ROOT_DIR, rawApkRelPath);

  if (!fs.existsSync(rawApkAbsPath)) {
    failFast({
      step: 'Verify APK Generated',
      error: `Release APK was not found at expected location: ${rawApkRelPath}`,
      why: 'Gradle reported build success but output APK file is missing.',
      fix: 'Run "cd android && ./gradlew assembleRelease" manually to check output directory.'
    });
  }

  const rawStats = fs.statSync(rawApkAbsPath);
  const sizeMb = (rawStats.size / (1024 * 1024)).toFixed(2);

  // Step 5: Archive & Rename into releases/ directory
  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
  }

  const baseApkName = `ExpenseTracker-v${version.versionName}-build${version.versionCode}`;
  const { targetPath: archivedApkPath, fileName: archivedFileName } = getUniqueReleaseApkPath(baseApkName);

  fs.copyFileSync(rawApkAbsPath, archivedApkPath);
  // Also copy to latest app-release.apk for quick access
  const latestApkPath = path.join(RELEASES_DIR, 'app-release.apk');
  try { fs.copyFileSync(rawApkAbsPath, latestApkPath); } catch (_) {}

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  const durationFormatted = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

  console.log('\n' + '='.repeat(60));
  console.log('🎉 RELEASE APK SUCCESSFULLY GENERATED & ARCHIVED');
  console.log('='.repeat(60));
  console.log(`📦 Primary Output:  ${rawApkRelPath}`);
  console.log(`📁 Archived Output: releases/${archivedFileName}`);
  console.log(`📁 Latest Output:   releases/app-release.apk`);
  console.log(`⚖️  APK Size:        ${sizeMb} MB`);
  console.log(`⏱️  Build Time:      ${durationFormatted}`);
  console.log('='.repeat(60) + '\n');

  const buildResult = {
    rawApkPath: rawApkRelPath,
    archivedApkPath: `releases/${archivedFileName}`,
    archivedApkFullPath: archivedApkPath,
    apkSizeMb: `${sizeMb} MB`,
    buildTime: durationFormatted,
    builtAt: new Date().toISOString()
  };

  saveReleaseState({ build: buildResult });

  return buildResult;
}

if (require.main === module) {
  buildRelease();
}

module.exports = { buildRelease };
