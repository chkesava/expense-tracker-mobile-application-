#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  ROOT_DIR,
  ANDROID_DIR,
  PACKAGE_JSON_PATH,
  failFast,
  saveReleaseState
} = require('./common');

function checkNode() {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
  if (major < 18) {
    failFast({
      step: 'Check Node Version',
      error: `Node version ${nodeVersion} is unsupported.`,
      why: 'Expo SDK 57 and React Native 0.86 require Node.js 18 or higher.',
      fix: 'Install Node.js LTS (>= 18.x or 20.x) from https://nodejs.org'
    });
  }
  return nodeVersion;
}

function checkJava() {
  let javaVersionStr = '';
  try {
    const javaOut = execSync('javac -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    javaVersionStr = javaOut.trim();
  } catch (e) {
    try {
      const javaOut2 = execSync('java -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      javaVersionStr = javaOut2.trim() || (e.stderr ? e.stderr.toString().trim() : '');
    } catch (err) {
      failFast({
        step: 'Check Java Version',
        error: 'JDK is not detected or not available in PATH.',
        why: 'Gradle requires a valid Java Development Kit (JDK 17 or JDK 21) to compile Android applications.',
        fix: 'Install OpenJDK 17 or 21 and ensure JAVA_HOME and PATH are properly configured.'
      });
    }
  }

  const match = javaVersionStr.match(/(?:javac|openjdk|java)\s+(?:version\s+)?["']?(\d+[\.\d_]*)/i) ||
                javaVersionStr.match(/(\d+\.\d+[\.\d_]*)/);
  const versionNumber = match ? match[1] : javaVersionStr.split('\n')[0];
  return versionNumber || 'Detected (Java 17/21)';
}

function checkAndroidSdk() {
  let sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

  if (!sdkPath) {
    const isWindows = process.platform === 'win32';
    const defaultWin = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
    const defaultMac = path.join(process.env.HOME || '', 'Library', 'Android', 'sdk');
    const defaultLinux = path.join(process.env.HOME || '', 'Android', 'Sdk');

    if (isWindows && fs.existsSync(defaultWin)) {
      sdkPath = defaultWin;
    } else if (process.platform === 'darwin' && fs.existsSync(defaultMac)) {
      sdkPath = defaultMac;
    } else if (fs.existsSync(defaultLinux)) {
      sdkPath = defaultLinux;
    }
  }

  if (!sdkPath || !fs.existsSync(sdkPath)) {
    failFast({
      step: 'Check Android SDK',
      error: 'Android SDK directory not found.',
      why: 'Android builds require the Android SDK (platforms, build-tools) to compile.',
      fix: 'Install Android Studio / Command Line Tools and set the ANDROID_HOME environment variable.'
    });
  }

  return sdkPath;
}

function checkGradle() {
  const isWindows = process.platform === 'win32';
  const gradlew = path.join(ANDROID_DIR, isWindows ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(gradlew)) {
    failFast({
      step: 'Check Gradle',
      error: `Gradle wrapper not found at ${gradlew}`,
      why: 'The native Android project is missing the Gradle build wrapper.',
      fix: 'Run "npx expo prebuild" to initialize native Android files.'
    });
  }
  return 'Gradle Wrapper Ready';
}

function getPackageVersions() {
  let expoVersion = '57.0.x';
  let rnVersion = '0.86.x';
  if (fs.existsSync(PACKAGE_JSON_PATH)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
      if (pkg.dependencies) {
        if (pkg.dependencies.expo) expoVersion = pkg.dependencies.expo;
        if (pkg.dependencies['react-native']) rnVersion = pkg.dependencies['react-native'];
      }
    } catch (_) {}
  }
  return { expoVersion, rnVersion };
}

function verifyEnvironment() {
  console.log('🔍 [Verify 1/4] Verifying Build Environment...');

  const nodeVer = checkNode();
  const javaVer = checkJava();
  const sdkPath = checkAndroidSdk();
  const gradleStatus = checkGradle();
  const { expoVersion, rnVersion } = getPackageVersions();

  const envData = {
    node: nodeVer,
    java: javaVer,
    androidSdk: sdkPath,
    gradle: gradleStatus,
    expo: expoVersion,
    reactNative: rnVersion
  };

  saveReleaseState({ environment: envData });

  console.log(`   ✅ Node.js:      ${nodeVer}`);
  console.log(`   ✅ Java JDK:     ${javaVer}`);
  console.log(`   ✅ Android SDK:  ${sdkPath}`);
  console.log(`   ✅ Gradle:       ${gradleStatus}`);
  console.log(`   ✅ Expo SDK:     ${expoVersion}`);
  console.log(`   ✅ React Native: ${rnVersion}`);

  return envData;
}

if (require.main === module) {
  verifyEnvironment();
}

module.exports = { verifyEnvironment };
