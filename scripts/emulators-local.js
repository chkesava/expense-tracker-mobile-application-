#!/usr/bin/env node
/**
 * SPENDLY-175: starts the Firebase Local Emulator Suite for "Spendly Test"
 * builds (Auth 9099, Firestore 8080, Storage 9199; see firebase.json).
 *
 * Data persists in the gitignored .emulator-data/ between runs: it is imported
 * when a previous export exists and exported again on exit (Ctrl+C), so the
 * seed (npm run emulators:seed) only needs to run once. The project is
 * `demo-spendly`, which never exists in Google's cloud.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = '.emulator-data';
const hasExport = fs.existsSync(path.join(ROOT, DATA_DIR, 'firebase-export-metadata.json'));

const args = [
  'emulators:start',
  '--only', 'auth,firestore,storage',
  '--project', 'demo-spendly',
  `--export-on-exit=${DATA_DIR}`,
  ...(hasExport ? ['--import', DATA_DIR] : []),
];

console.log(hasExport ? `Importing emulator data from ${DATA_DIR}/` : 'No saved emulator data yet: run "npm run emulators:seed" once it is up.');

const child = spawn('firebase', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
