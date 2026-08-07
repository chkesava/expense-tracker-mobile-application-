#!/usr/bin/env node

const fs = require('fs');
const {
  BUILD_GRADLE_PATH,
  GRADLE_PROPS_PATH,
  DEFAULT_STORE_FILE,
  DEFAULT_KEY_ALIAS,
  failFast,
  saveReleaseState
} = require('./common');

function verifyGradle() {
  console.log('⚙️  [Verify 4/4] Verifying Android Gradle Configuration...');

  // 1. Verify & Auto-repair build.gradle release signing
  if (!fs.existsSync(BUILD_GRADLE_PATH)) {
    failFast({
      step: 'Verify build.gradle Release Signing',
      error: `build.gradle not found at ${BUILD_GRADLE_PATH}`,
      why: 'Native Android build file is missing.',
      fix: 'Run "npx expo prebuild" to initialize native files.'
    });
  }

  let buildGradle = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
  let buildGradleModified = false;

  const releaseSigningBlock = `        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                def storeFilePath = MYAPP_RELEASE_STORE_FILE
                storeFile file(storeFilePath).exists() ? file(storeFilePath) : rootProject.file(storeFilePath)
                storePassword project.findProperty('MYAPP_RELEASE_STORE_PASSWORD') ?: System.getenv('MYAPP_RELEASE_STORE_PASSWORD')
                keyAlias project.findProperty('MYAPP_RELEASE_KEY_ALIAS') ?: System.getenv('MYAPP_RELEASE_KEY_ALIAS')
                keyPassword project.findProperty('MYAPP_RELEASE_KEY_PASSWORD') ?: System.getenv('MYAPP_RELEASE_KEY_PASSWORD')
            }
        }`;

  if (!buildGradle.includes("release {") || !buildGradle.includes("MYAPP_RELEASE_STORE_FILE")) {
    console.log('   ℹ️  Configuring signingConfigs.release in build.gradle...');
    buildGradle = buildGradle.replace(
      /signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\}\s*\}/,
      (match) => {
        const withoutClosingBrace = match.replace(/\s*\}\s*$/, '');
        return `${withoutClosingBrace}\n${releaseSigningBlock}\n    }`;
      }
    );
    buildGradleModified = true;
  }

  // Ensure buildTypes.release has signingConfig signingConfigs.release
  if (buildGradle.includes("signingConfig signingConfigs.debug")) {
    // Replace only within buildTypes release block
    buildGradle = buildGradle.replace(
      /(release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release'
    );
    buildGradleModified = true;
  }

  if (buildGradleModified) {
    fs.writeFileSync(BUILD_GRADLE_PATH, buildGradle, 'utf8');
  }

  console.log('   ✅ build.gradle:  Release signing config verified (signingConfigs.release)');

  // 2. Verify & update gradle.properties idempotently
  if (!fs.existsSync(GRADLE_PROPS_PATH)) {
    failFast({
      step: 'Verify gradle.properties',
      error: `gradle.properties not found at ${GRADLE_PROPS_PATH}`,
      why: 'Gradle properties file is required to store Android build properties.',
      fix: 'Run "npx expo prebuild" to initialize the Android directory.'
    });
  }

  let gradleProps = fs.readFileSync(GRADLE_PROPS_PATH, 'utf8');

  // Check for and remove any hardcoded passwords
  const hasHardcodedStorePass = /^MYAPP_RELEASE_STORE_PASSWORD=.*$/m.test(gradleProps);
  const hasHardcodedKeyPass = /^MYAPP_RELEASE_KEY_PASSWORD=.*$/m.test(gradleProps);

  if (hasHardcodedStorePass || hasHardcodedKeyPass) {
    console.log('   ⚠️  Removing hardcoded passwords from gradle.properties for security...');
    gradleProps = gradleProps.replace(/^MYAPP_RELEASE_STORE_PASSWORD=.*$/gm, '');
    gradleProps = gradleProps.replace(/^MYAPP_RELEASE_KEY_PASSWORD=.*$/gm, '');
  }

  // Idempotently ensure signing properties exist
  const expectedStoreFile = `MYAPP_RELEASE_STORE_FILE=${DEFAULT_STORE_FILE}`;
  const expectedKeyAlias = `MYAPP_RELEASE_KEY_ALIAS=${DEFAULT_KEY_ALIAS}`;

  if (/^MYAPP_RELEASE_STORE_FILE=.*$/m.test(gradleProps)) {
    gradleProps = gradleProps.replace(/^MYAPP_RELEASE_STORE_FILE=.*$/m, expectedStoreFile);
  } else {
    gradleProps = gradleProps.trimEnd() + '\n' + expectedStoreFile + '\n';
  }

  if (/^MYAPP_RELEASE_KEY_ALIAS=.*$/m.test(gradleProps)) {
    gradleProps = gradleProps.replace(/^MYAPP_RELEASE_KEY_ALIAS=.*$/m, expectedKeyAlias);
  } else {
    gradleProps = gradleProps.trimEnd() + '\n' + expectedKeyAlias + '\n';
  }

  gradleProps = gradleProps.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  fs.writeFileSync(GRADLE_PROPS_PATH, gradleProps, 'utf8');

  console.log('   ✅ gradle.props:  Properties verified (MYAPP_RELEASE_STORE_FILE, MYAPP_RELEASE_KEY_ALIAS)');
  console.log('   ✅ Passwords:     Zero hardcoded passwords (loaded dynamically from secure env)');

  saveReleaseState({
    gradle: {
      buildGradleValid: true,
      gradlePropertiesValid: true
    }
  });

  return { verified: true };
}

if (require.main === module) {
  verifyGradle();
}

module.exports = { verifyGradle };
