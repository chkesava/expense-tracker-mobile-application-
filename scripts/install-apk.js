#!/usr/bin/env node
/**
 * SPENDLY-493: install an APK over adb and AOT-compile it right away.
 *
 * `adb install` (and a manual sideload through the system installer) leaves
 * the app at dexopt filter `verify`: its Java/Kotlin code (React Native,
 * Reanimated, Fabric mounting) runs interpreted/JIT until Android's idle-time
 * dexopt gets to it, usually overnight on a charger. On a CPH2661 that made
 * every fresh build feel laggy; compiling cut UI-thread CPU by 38% and halved
 * p95/p99 frame times (docs/PERF_DIAGNOSIS_2026-10-10.md).
 *
 *   npm run android:install                                   # dist/Spendly-Test.apk
 *   npm run android:install -- path/to/app.apk --package=com.example.expensetracker
 *   npm run android:install -- --compile-only --package=com.example.expensetracker
 *
 * A fresh install has no usage profile yet, so `speed-profile` would compile
 * almost nothing; this uses `speed` (full AOT). The app must be restarted to
 * pick the compiled code up, so the script force-stops it.
 *
 * `--compile-only` skips the install: use it after an in-app update or a
 * manual sideload of a release APK.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_APK = path.join(ROOT_DIR, 'dist', 'Spendly-Test.apk');
const TEST_PACKAGE = 'com.example.expensetracker.localtest';

function parseArgs(argv) {
  const options = { apk: undefined, pkg: undefined, compileOnly: false };
  for (const arg of argv) {
    if (arg === '--compile-only') options.compileOnly = true;
    else if (arg.startsWith('--package=')) options.pkg = arg.slice('--package='.length);
    else if (!arg.startsWith('--')) options.apk = arg;
    else throw new Error(`Unknown option ${arg}`);
  }
  if (!options.compileOnly && !options.apk) options.apk = DEFAULT_APK;
  // Only the test APK has a package id we can know without parsing the APK.
  if (!options.pkg && options.apk && path.resolve(options.apk) === DEFAULT_APK) {
    options.pkg = TEST_PACKAGE;
  }
  if (!options.pkg) {
    throw new Error('Pass --package=<application id> (e.g. com.example.expensetracker).');
  }
  return options;
}

function adb(args) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

function dexoptStatus(pkg) {
  const dump = adb(['shell', 'dumpsys', 'package', 'dexopt']);
  const start = dump.indexOf(`[${pkg}]`);
  if (start === -1) return 'unknown';
  const match = /\[status=([^\]]+)\]/.exec(dump.slice(start, start + 600));
  return match ? match[1] : 'unknown';
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (!options.compileOnly) {
    if (!fs.existsSync(options.apk)) {
      console.error(`No APK at ${options.apk}`);
      process.exit(1);
    }
    console.log(`Installing ${path.relative(ROOT_DIR, options.apk)}...`);
    adb(['install', '-r', options.apk]);
  }

  console.log(`dexopt before: ${dexoptStatus(options.pkg)}`);
  console.log(`Compiling ${options.pkg} (speed), this can take a minute...`);
  adb(['shell', 'cmd', 'package', 'compile', '-m', 'speed', '-f', options.pkg]);
  adb(['shell', 'am', 'force-stop', options.pkg]);
  console.log(`dexopt after:  ${dexoptStatus(options.pkg)}`);
  console.log('Done. Open the app again to run the compiled code.');
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, DEFAULT_APK, TEST_PACKAGE };
