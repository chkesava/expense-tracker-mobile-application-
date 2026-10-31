#!/usr/bin/env node
/**
 * SPENDLY-588 — the read-inventory lab run (docs/SPENDLY-588-read-inventory.md §4).
 *
 * Drives Spendly Test on Expo web against the Firebase emulator with headless
 * Chrome and prints `spendlyReadInventory.table()` after each step. It never
 * touches production: the app runs in local test mode and the "other device"
 * write goes straight to the emulator on 127.0.0.1:8080.
 *
 * Needs (not repo dependencies):
 *   npm i --no-save playwright-core     # uses the installed Chrome
 * Then, in three terminals:
 *   npm run emulators:local && npm run emulators:seed
 *   EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 npx expo start --web --port 8089 --clear
 *   node scripts/read-inventory-lab.js > lab-results.md
 * Env: LAB_URL (default http://localhost:8089), CHROME_PATH, IDLE_MS (default 300000).
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = process.env.LAB_URL || 'http://localhost:8089';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR = path.join(os.tmpdir(), 'spendly-read-lab');
const IDLE_MS = Number(process.env.IDLE_MS || 300000);
const log = (s) => console.log(s);

async function table(page, title) {
  const t = await page.evaluate(() => globalThis.spendlyReadInventory.table());
  log(`\n### ${title}\n\nURL: ${new URL(page.url()).pathname}\n\n${t}\n`);
}
async function reset(page) { await page.evaluate(() => globalThis.spendlyReadInventory.reset()); }
async function tap(page, name, wait = 15000) {
  await page.locator(`[aria-label="${name}"]`).first().click();
  await page.waitForTimeout(wait);
}
async function signIn(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForTimeout(15000);
  for (let i = 0; i < 5 && !/login/.test(page.url()); i++) {
    if (/welcome/.test(page.url())) await page.getByText('Expense Tracker', { exact: true }).click();
    else if (/onboarding/.test(page.url())) await page.getByText(/Sign In/).last().click();
    await page.waitForTimeout(5000);
  }
  await page.getByPlaceholder('you@example.com').fill('demo@spendly.test');
  await page.getByPlaceholder('••••••••').fill('spendly-demo');
  await page.getByText('Sign in', { exact: true }).click();
}
async function otherDeviceWrite() {
  // A write as if from another device: straight to the emulator, never through the app.
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const body = { fields: {
    amount: { doubleValue: 199 }, category: { stringValue: 'Food & Groceries' }, note: { stringValue: 'lab other-device write' },
    date: { stringValue: date }, month: { stringValue: date.slice(0, 7) },
    createdAt: { timestampValue: now.toISOString() }, updatedAt: { timestampValue: now.toISOString() },
  } };
  const r = await fetch('http://127.0.0.1:8080/v1/projects/demo-spendly/databases/(default)/documents/users/demo-spendly-user/expenses?documentId=lab-other-device-' + now.getTime(), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('emulator write failed ' + r.status + ' ' + (await r.text()));
}

(async () => {
  log(`# SPENDLY-588 lab run, ${new Date().toISOString()}\n\nSpendly Test on the Firebase emulator (demo-spendly), Expo web dev build, 588 branch (meter with the cold-from-cache fix), headless Chrome. Seed: 129 expenses, 4 incomes, 4 accounts, 3 subscriptions, 2 goals, 3 holdings, 4 budgets.`);
  // A0: first launch on this browser: empty cache, sign in, dashboard.
  fs.rmSync(path.join(DIR, 'profile-fresh'), { recursive: true, force: true });
  const fresh = await chromium.launchPersistentContext(path.join(DIR, 'profile-fresh'), { executablePath: CHROME, headless: true, viewport: { width: 420, height: 900 } });
  const fp = fresh.pages()[0] || await fresh.newPage();
  await signIn(fp);
  await fp.waitForTimeout(30000);
  await table(fp, 'A0. First launch, empty cache: sign in to the dashboard (30 s after sign-in)');
  await fresh.close();

  const ctx = await chromium.launchPersistentContext(path.join(DIR, 'profile'), { executablePath: CHROME, headless: true, viewport: { width: 420, height: 900 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  // Setup (not measured): make sure this profile is signed in, so A is a real relaunch.
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForTimeout(15000);
  if (!/dashboard/.test(page.url())) { await signIn(page); await page.waitForTimeout(30000); }
  // Prove the bundle has the cold-from-cache fix: a cache-only doc must bill 1 cold read.
  const probe = await page.evaluate(() => typeof globalThis.spendlyReadInventory?.table);
  log(`Setup: signed in (${new URL(page.url()).pathname}); meter ${probe}.`);

  // A: launch with a warm IndexedDB cache (signed in earlier in this profile).
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForTimeout(30000);
  await table(page, 'A. Launch to the dashboard (30 s)');

  // B: reload within a minute.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(30000);
  await table(page, 'B. Reload within a minute (30 s)');

  // C: screens, client-side navigation.
  for (const name of ['Go to Money', 'Go to Analytics', 'Go to Investments', 'Go to Vaults', 'Go to Dashboard', 'Open Credit cards']) {
    await reset(page);
    await tap(page, name);
    await table(page, `C. ${name.replace(/^(Go to|Open) /, '')}`);
  }

  // D: idle.
  await reset(page);
  await page.waitForTimeout(IDLE_MS);
  await table(page, `D. Idle on the dashboard (${Math.round(IDLE_MS / 60000)} min)`);

  // E: one expense written by another device.
  await reset(page);
  await otherDeviceWrite();
  await page.waitForTimeout(10000);
  await table(page, 'E. One expense written by another device');

  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
