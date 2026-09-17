#!/usr/bin/env node

/**
 * SPENDLY-8 / SEC-07 helpers for the Firestore rules CI workflow.
 *
 * The workflow is workflow_dispatch + a nightly drift job. It is never a
 * pull_request workflow: FIREBASE_SERVICE_ACCOUNT must not reach fork PRs.
 *
 * Commands:
 *   warn --log-file <path>     Fail if firebase deploy printed `[W]`
 *   compile --project <id> [--repo-rules <f>]
 *   deploy-rules --project <id> [--repo-rules <f>]
 *   seed-cli-api-cache --project <id> [--config-file <f>]
 *   diff-indexes --repo <f> --live <f> [--fail-on-drift]
 *   assert-index-deploy --repo <f> --live <f>
 *   drift --project <id> --repo-rules <f> --repo-indexes <f> --live-indexes <f>
 *   smoke --project <id>
 *
 * Rules compile/upload talk to firebaserules.googleapis.com directly. The
 * Firebase CLI's `firebase deploy --only firestore:rules` first probes
 * serviceusage.googleapis.com (ensure firestore.googleapis.com is enabled),
 * and the GitHub Actions service account is not granted that permission.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { cert, applicationDefault } = require('firebase-admin/app');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const DEFAULT_PROJECT = 'expenseapp-27f94';
const SMOKE_UID = 'spendly-sec07-smoke';
const STRANGER_UID = 'spendly-sec07-stranger';

function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().startsWith('{')) {
    return cert(JSON.parse(inline));
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return applicationDefault();
  }
  throw new Error(
    'No Firebase service account credentials found. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.'
  );
}

function ensureAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: loadCredential() });
}

function assertNoRulesCompilerWarnings(logText) {
  const lines = String(logText).split(/\r?\n/);
  const warnings = lines.filter((line) => /\[W\]/.test(line));
  if (warnings.length > 0) {
    const error = new Error(
      `Firestore rules compiler warnings are fatal in CI:\n${warnings.join('\n')}`
    );
    error.warnings = warnings;
    throw error;
  }
  return { ok: true, warnings: [] };
}

function rulesSourcePayload(content, fileName = 'firestore.rules') {
  return { source: { files: [{ name: fileName, content: String(content) }] } };
}

function formatRulesIssue(issue) {
  const severity = String((issue && issue.severity) || 'ERROR').toUpperCase();
  const tag = `[${severity.charAt(0)}]`;
  const position = (issue && issue.sourcePosition) || {};
  const line = position.line != null ? position.line : '?';
  const column = position.column != null ? position.column : '?';
  const description = (issue && issue.description) || 'unknown compiler issue';
  return `${tag} ${line}:${column} - ${description}`;
}

function assertNoRulesCompilerIssues(issues) {
  const list = Array.isArray(issues) ? issues : [];
  if (list.length === 0) return { ok: true, formatted: [] };
  const formatted = list.map(formatRulesIssue);
  const error = new Error(
    `Firestore rules compiler warnings are fatal in CI:\n${formatted.join('\n')}`
  );
  error.warnings = formatted;
  throw error;
}

function defaultFirebaseToolsConfigPath() {
  return path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
}

function seedFirebaseToolsApiEnablementCache(projectId, filePath) {
  if (!projectId) {
    throw new Error('projectId is required to seed the firebase-tools API cache.');
  }
  const resolved = filePath || defaultFirebaseToolsConfigPath();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  let existing = {};
  if (fs.existsSync(resolved)) {
    try {
      existing = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch {
      existing = {};
    }
  }
  if (!existing.apiEnablementCache || typeof existing.apiEnablementCache !== 'object') {
    existing.apiEnablementCache = {};
  }
  existing.apiEnablementCache[projectId] = {
    ...(existing.apiEnablementCache[projectId] || {}),
    'firestore.googleapis.com': true,
  };
  fs.writeFileSync(resolved, `${JSON.stringify(existing, null, 2)}\n`);
  return resolved;
}

function stripNameField(fields) {
  return (fields || []).filter((field) => field.fieldPath !== '__name__');
}

function fingerprintIndex(index) {
  const fields = stripNameField(index.fields).map((field) => ({
    fieldPath: field.fieldPath,
    order: field.order || null,
    arrayConfig: field.arrayConfig || null,
    vectorConfig: field.vectorConfig || null,
  }));
  return JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields,
  });
}

function fingerprintFieldOverride(override) {
  const indexes = (override.indexes || [])
    .map((entry) => ({
      order: entry.order || null,
      arrayConfig: entry.arrayConfig || null,
      queryScope: entry.queryScope || null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify({
    collectionGroup: override.collectionGroup,
    fieldPath: override.fieldPath,
    indexes,
  });
}

function extractJsonObject(text) {
  const start = String(text).indexOf('{');
  const end = String(text).lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('firebase firestore:indexes output did not contain a JSON object.');
  }
  return JSON.parse(String(text).slice(start, end + 1));
}

function parseIndexesDoc(doc) {
  const parsed = typeof doc === 'string' ? extractJsonObject(doc) : doc;
  return {
    indexes: Array.isArray(parsed.indexes) ? parsed.indexes : [],
    fieldOverrides: Array.isArray(parsed.fieldOverrides) ? parsed.fieldOverrides : [],
  };
}

function collectMissing(sourceMap, otherMap) {
  const missing = [];
  for (const [fingerprint, value] of sourceMap) {
    if (!otherMap.has(fingerprint)) missing.push(value);
  }
  return missing;
}

function diffIndexes(repoDoc, liveDoc) {
  const repo = parseIndexesDoc(repoDoc);
  const live = parseIndexesDoc(liveDoc);

  const repoIndexes = new Map(repo.indexes.map((index) => [fingerprintIndex(index), index]));
  const liveIndexes = new Map(live.indexes.map((index) => [fingerprintIndex(index), index]));
  const repoOverrides = new Map(
    repo.fieldOverrides.map((entry) => [fingerprintFieldOverride(entry), entry])
  );
  const liveOverrides = new Map(
    live.fieldOverrides.map((entry) => [fingerprintFieldOverride(entry), entry])
  );

  const missingFromRepo = collectMissing(liveIndexes, repoIndexes);
  const extraInRepo = collectMissing(repoIndexes, liveIndexes);
  const missingOverridesFromRepo = collectMissing(liveOverrides, repoOverrides);
  const extraOverridesInRepo = collectMissing(repoOverrides, liveOverrides);
  const wouldDeleteLiveIndexes =
    missingFromRepo.length > 0 || missingOverridesFromRepo.length > 0;
  const identical =
    missingFromRepo.length === 0 &&
    extraInRepo.length === 0 &&
    missingOverridesFromRepo.length === 0 &&
    extraOverridesInRepo.length === 0;

  return {
    missingFromRepo,
    extraInRepo,
    missingOverridesFromRepo,
    extraOverridesInRepo,
    wouldDeleteLiveIndexes,
    identical,
    repoIndexCount: repo.indexes.length,
    liveIndexCount: live.indexes.length,
  };
}

function describeIndex(index) {
  const fields = stripNameField(index.fields)
    .map((field) => `${field.fieldPath}:${field.order || field.arrayConfig || '?'}`)
    .join(', ');
  return `${index.collectionGroup} [${index.queryScope}] (${fields})`;
}

function describeOverride(override) {
  return `${override.collectionGroup}.${override.fieldPath}`;
}

function formatIndexDiff(diff) {
  const lines = [
    `Repo indexes: ${diff.repoIndexCount}; live indexes: ${diff.liveIndexCount}.`,
  ];
  if (diff.identical) {
    lines.push('Indexes match. A firestore:indexes deploy would not delete anything.');
    return lines.join('\n');
  }
  if (diff.missingFromRepo.length) {
    lines.push('Live indexes missing from firestore.indexes.json (a naive deploy DELETES these):');
    for (const index of diff.missingFromRepo) lines.push(`  - ${describeIndex(index)}`);
  }
  if (diff.missingOverridesFromRepo.length) {
    lines.push('Live fieldOverrides missing from firestore.indexes.json:');
    for (const entry of diff.missingOverridesFromRepo) {
      lines.push(`  - ${describeOverride(entry)}`);
    }
  }
  if (diff.extraInRepo.length) {
    lines.push('Repo indexes not yet live (deploy would create these):');
    for (const index of diff.extraInRepo) lines.push(`  - ${describeIndex(index)}`);
  }
  if (diff.extraOverridesInRepo.length) {
    lines.push('Repo fieldOverrides not yet live:');
    for (const entry of diff.extraOverridesInRepo) {
      lines.push(`  - ${describeOverride(entry)}`);
    }
  }
  return lines.join('\n');
}

function assertIndexDeploySafe(diff) {
  if (!diff.wouldDeleteLiveIndexes) return { ok: true };
  throw new Error(
    `Refusing firestore:indexes deploy — live indexes are missing from firestore.indexes.json.\n${formatIndexDiff(diff)}`
  );
}

function normalizeRulesSource(text) {
  return `${String(text).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '')}\n`;
}

function diffRulesSource(repoText, liveText) {
  const repo = normalizeRulesSource(repoText);
  const live = normalizeRulesSource(liveText);
  return {
    identical: repo === live,
    repoChars: repo.length,
    liveChars: live.length,
  };
}

async function getAccessToken() {
  const credential = loadCredential();
  const token = await credential.getAccessToken();
  if (!token || !token.access_token) {
    throw new Error('Service account did not return an access token.');
  }
  return token.access_token;
}

async function fetchJson(url, { accessToken, idToken, method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { ok: response.ok, status: response.status, body: parsed, text };
}

async function fetchLiveRulesSource(projectId) {
  const accessToken = await getAccessToken();
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`;
  const release = await fetchJson(releaseUrl, { accessToken });
  if (!release.ok) {
    throw new Error(`Failed to read live Firestore release: HTTP ${release.status} ${release.text.slice(0, 400)}`);
  }
  const rulesetName = release.body && release.body.rulesetName;
  if (!rulesetName) {
    throw new Error('Live Firestore release did not include rulesetName.');
  }
  const ruleset = await fetchJson(`https://firebaserules.googleapis.com/v1/${rulesetName}`, {
    accessToken,
  });
  if (!ruleset.ok) {
    throw new Error(`Failed to read live Firestore ruleset: HTTP ${ruleset.status} ${ruleset.text.slice(0, 400)}`);
  }
  const files = (ruleset.body && ruleset.body.source && ruleset.body.source.files) || [];
  const rulesFile =
    files.find((file) => /firestore\.rules$/i.test(file.name || '')) || files[0];
  if (!rulesFile || typeof rulesFile.content !== 'string') {
    throw new Error('Live Firestore ruleset has no source file content.');
  }
  return rulesFile.content;
}

async function compileRulesSource(projectId, rulesPath) {
  const content = readRequiredFile(rulesPath, 'Repo rules');
  const accessToken = await getAccessToken();
  const url = `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}:test`;
  const result = await fetchJson(url, {
    accessToken,
    method: 'POST',
    body: rulesSourcePayload(content),
  });
  if (!result.ok) {
    throw new Error(
      `Rules compile failed: HTTP ${result.status} ${String(result.text).slice(0, 400)}`
    );
  }
  const issues = (result.body && result.body.issues) || [];
  return { content, issues };
}

async function createAndReleaseRuleset(projectId, content) {
  const accessToken = await getAccessToken();
  const created = await fetchJson(
    `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/rulesets`,
    {
      accessToken,
      method: 'POST',
      body: rulesSourcePayload(content),
    }
  );
  if (!created.ok || !created.body || !created.body.name) {
    throw new Error(
      `Failed to create Firestore ruleset: HTTP ${created.status} ${String(created.text).slice(0, 400)}`
    );
  }
  const rulesetName = created.body.name;
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const patched = await fetchJson(
    `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`,
    {
      accessToken,
      method: 'PATCH',
      body: { name: releaseName, rulesetName },
    }
  );
  if (patched.ok) {
    return { rulesetName, releaseName, createdRelease: false };
  }
  const createdRelease = await fetchJson(
    `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/releases`,
    {
      accessToken,
      method: 'POST',
      body: { name: releaseName, rulesetName },
    }
  );
  if (!createdRelease.ok) {
    throw new Error(
      `Failed to publish Firestore ruleset ${rulesetName}: HTTP ${patched.status}/${createdRelease.status} ${String(createdRelease.text).slice(0, 400)}`
    );
  }
  return { rulesetName, releaseName, createdRelease: true };
}

function readRequiredFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq >= 0) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          args[key] = true;
        } else {
          args[key] = next;
          i += 1;
        }
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function runSmokeProbe({
  projectId,
  apiKey,
  ownUid = SMOKE_UID,
  strangerUid = STRANGER_UID,
}) {
  if (!apiKey) {
    throw new Error(
      'EXPO_PUBLIC_FIREBASE_API_KEY is empty; cannot exchange a custom token for the production smoke probe.'
    );
  }
  const app = ensureAdminApp();
  const customToken = await getAuth(app).createCustomToken(ownUid);
  const signIn = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      body: { token: customToken, returnSecureToken: true },
    }
  );
  if (!signIn.ok || !signIn.body || !signIn.body.idToken) {
    throw new Error(
      `Custom-token sign-in failed: HTTP ${signIn.status} ${signIn.text.slice(0, 400)}`
    );
  }
  const idToken = signIn.body.idToken;
  const ownUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(ownUid)}`;
  const strangerUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(strangerUid)}`;
  const own = await fetchJson(ownUrl, { idToken });
  const stranger = await fetchJson(strangerUrl, { idToken });

  // Own user doc: missing (404) or present (200) both mean the owner read was allowed.
  if (own.status !== 200 && own.status !== 404) {
    throw new Error(
      `Smoke uid ${ownUid} could not read users/${ownUid}: HTTP ${own.status} ${own.text.slice(0, 300)}`
    );
  }
  // Stranger: permission-denied. 404 would mean the get was allowed on a missing doc.
  if (stranger.status !== 403) {
    throw new Error(
      `Stranger read was not denied (expected HTTP 403, got ${stranger.status}). Live rules may have drifted.`
    );
  }
  return {
    ok: true,
    ownUid,
    ownStatus: own.status,
    strangerStatus: stranger.status,
  };
}

function print(message) {
  process.stdout.write(`${message}\n`);
}

async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command) {
    throw new Error(
      'Usage: node scripts/firestoreRulesCi.js <warn|compile|deploy-rules|seed-cli-api-cache|diff-indexes|assert-index-deploy|drift|smoke> ...'
    );
  }

  if (command === 'warn') {
    const logFile = args['log-file'];
    const logText = logFile
      ? readRequiredFile(logFile, 'Deploy log')
      : fs.readFileSync(0, 'utf8');
    assertNoRulesCompilerWarnings(logText);
    print('No Firestore rules compiler warnings.');
    return;
  }

  if (command === 'compile') {
    const projectId = args.project || DEFAULT_PROJECT;
    const rulesPath = args['repo-rules'] || 'firestore.rules';
    const compiled = await compileRulesSource(projectId, rulesPath);
    assertNoRulesCompilerIssues(compiled.issues);
    print(`Firestore rules compiled successfully (${rulesPath}, ${compiled.content.length} chars).`);
    print('No Firestore rules compiler warnings.');
    return;
  }

  if (command === 'deploy-rules') {
    const projectId = args.project || DEFAULT_PROJECT;
    const rulesPath = args['repo-rules'] || 'firestore.rules';
    const compiled = await compileRulesSource(projectId, rulesPath);
    assertNoRulesCompilerIssues(compiled.issues);
    print(`Firestore rules compiled successfully (${rulesPath}, ${compiled.content.length} chars).`);

    const liveRules = await fetchLiveRulesSource(projectId);
    const rulesDiff = diffRulesSource(compiled.content, liveRules);
    if (rulesDiff.identical) {
      print(`Live Firestore rules already match ${rulesPath}; skipping upload.`);
      print('Deploy complete');
      return;
    }

    const released = await createAndReleaseRuleset(projectId, compiled.content);
    print(`Uploaded ruleset ${released.rulesetName}`);
    print(`Released ${released.rulesetName} as ${released.releaseName}`);
    print('Deploy complete');
    return;
  }

  if (command === 'seed-cli-api-cache') {
    const projectId = args.project || DEFAULT_PROJECT;
    const written = seedFirebaseToolsApiEnablementCache(projectId, args['config-file']);
    print(`Seeded firebase-tools API enablement cache for ${projectId} at ${written}.`);
    return;
  }

  if (command === 'diff-indexes' || command === 'assert-index-deploy') {
    const repo = readRequiredFile(args.repo, 'Repo indexes');
    const live = readRequiredFile(args.live, 'Live indexes');
    const diff = diffIndexes(repo, live);
    print(formatIndexDiff(diff));
    if (command === 'assert-index-deploy') {
      assertIndexDeploySafe(diff);
      return;
    }
    if (args['fail-on-drift'] && !diff.identical) {
      throw new Error('Live Firestore indexes do not match firestore.indexes.json.');
    }
    return;
  }

  if (command === 'drift') {
    const projectId = args.project || DEFAULT_PROJECT;
    const repoRules = readRequiredFile(args['repo-rules'], 'Repo rules');
    const liveRules = await fetchLiveRulesSource(projectId);
    const rulesDiff = diffRulesSource(repoRules, liveRules);
    print(
      rulesDiff.identical
        ? `Live Firestore rules match ${args['repo-rules']} (${rulesDiff.repoChars} chars).`
        : `Live Firestore rules DRIFT from ${args['repo-rules']} (repo ${rulesDiff.repoChars} chars, live ${rulesDiff.liveChars} chars).`
    );

    const repoIndexes = readRequiredFile(args['repo-indexes'], 'Repo indexes');
    const liveIndexes = readRequiredFile(args['live-indexes'], 'Live indexes dump');
    const indexDiff = diffIndexes(repoIndexes, liveIndexes);
    print(formatIndexDiff(indexDiff));

    if (!rulesDiff.identical || !indexDiff.identical) {
      throw new Error(
        'Live Firestore rules/indexes do not match the repo. Deploy via workflow_dispatch after reconciling; do not naive-deploy indexes if live indexes are missing from the file.'
      );
    }
    return;
  }

  if (command === 'smoke') {
    const projectId = args.project || DEFAULT_PROJECT;
    const result = await runSmokeProbe({
      projectId,
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    });
    print(
      `Smoke ok: owner read HTTP ${result.ownStatus}; stranger denied HTTP ${result.strangerStatus} (uid ${result.ownUid}).`
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PROJECT,
  SMOKE_UID,
  STRANGER_UID,
  assertNoRulesCompilerIssues,
  assertNoRulesCompilerWarnings,
  assertIndexDeploySafe,
  compileRulesSource,
  createAndReleaseRuleset,
  defaultFirebaseToolsConfigPath,
  describeIndex,
  diffIndexes,
  diffRulesSource,
  extractJsonObject,
  fetchLiveRulesSource,
  formatIndexDiff,
  formatRulesIssue,
  fingerprintIndex,
  normalizeRulesSource,
  parseIndexesDoc,
  rulesSourcePayload,
  runSmokeProbe,
  seedFirebaseToolsApiEnablementCache,
};
