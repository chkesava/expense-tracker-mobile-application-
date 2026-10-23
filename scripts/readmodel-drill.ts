/**
 * SPENDLY-520 — read-model recovery drills, end to end, on a LOCAL stack only:
 * the Firebase emulator as Firestore, a local Postgres with the real
 * migrations, and PostgREST (the API Supabase runs) in front of it. The
 * drills run the production scripts unchanged (readmodel-sync.ts,
 * readmodel-verify.ts, readmodel-set-mode.ts, the account-deletion purge),
 * and judge the outcome with the convergence checker
 * (shared/utils/readModel/convergence.ts).
 *
 *   bash supabase-readmodel/drills/run_drills.sh      (sets everything up)
 *
 * Refuses to run unless Firestore is the emulator (a demo- project) and
 * Postgres is on localhost. Writes only to the emulator and the local
 * database. Prints a timestamped log and writes it as markdown to
 * DRILL_LOG (default: drill-log.md in the work dir).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

import { purgeReadModel } from "../netlify/functions/_readmodelPurge";
import { fullLedgerFixture } from "../shared/__fixtures__/readModel/fullLedger";
import { convergence, summarizeConvergence, type ConvergenceReport, type ModelRow } from "../shared/utils/readModel/convergence";
import { READ_MODEL_TABLES, type SourceDoc, type TableSpec } from "../shared/utils/readModel/mapping";
import { READ_MODEL_SCREENS } from "../shared/utils/readModelMode";
import { handleReadModelPush } from "../netlify/functions/_readmodelPushCore";
import { livePushPorts } from "../netlify/functions/readmodel-push";
import { runSync } from "./lib/readmodelSyncCore";
import { firestoreReader, supabaseSink } from "./readmodel-sync";

// ---------------------------------------------------------------- guards

const emulator = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const project = process.env.GCLOUD_PROJECT ?? "demo-readmodel-drill";
const pgUri = process.env.DRILL_PG_URI ?? "postgres://postgres@localhost:55432/readmodel_drill";
const workDir = process.env.DRILL_WORKDIR ?? process.cwd();
const postgrestBin = process.env.POSTGREST_BIN ?? "postgrest";
const repo = path.resolve(__dirname, "..");

if (!emulator) throw new Error("refusing: FIRESTORE_EMULATOR_HOST is not set (drills run on the emulator only)");
// Its own project: the drill clears this project's emulator data, so it must
// never be Spendly Test's (demo-spendly).
if (project !== "demo-readmodel-drill") throw new Error(`refusing: project ${project} is not demo-readmodel-drill`);
const pg = new URL(pgUri);
if (!["localhost", "127.0.0.1"].includes(pg.hostname)) throw new Error(`refusing: Postgres host ${pg.hostname} is not local`);
const dbName = pg.pathname.slice(1);
if (!dbName.includes("drill")) throw new Error(`refusing: database ${dbName} is not a drill database`);

// ---------------------------------------------------------------- log

const lines: string[] = [];
function log(drill: string, message: string) {
  const line = `${new Date().toISOString()}  [${drill}] ${message}`;
  console.log(line);
  lines.push(line);
}
const results: { drill: string; expected: string; observed: string; pass: boolean }[] = [];
function result(drill: string, expected: string, observed: string, pass: boolean) {
  results.push({ drill, expected, observed, pass });
  log(drill, `${pass ? "PASS" : "FAIL"}: ${observed}`);
}

// ---------------------------------------------------------------- local Supabase stand-in

const JWT_SECRET = "drill-only-secret-not-used-anywhere-else-0123456789";
const REST_PORT = 54329;
const API_PORT = 54321;
const API_URL = `http://127.0.0.1:${API_PORT}`;

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}`;
  return `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
}
const SERVICE_KEY = jwt({ role: "service_role", iss: "supabase-drill", exp: Math.floor(Date.now() / 1000) + 6 * 3600 });

let postgrest: ChildProcess | null = null;
async function startPostgrest() {
  const config = path.join(workDir, "postgrest-drill.conf");
  writeFileSync(config, [
    `db-uri = "${pgUri}"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${JWT_SECRET}"`,
    `server-port = ${REST_PORT}`,
    `server-host = "127.0.0.1"`,
  ].join("\n"));
  postgrest = spawn(postgrestBin, [config], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      const ok = await fetch(`http://127.0.0.1:${REST_PORT}/`).then((r) => r.status < 500);
      if (ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("PostgREST did not start");
}
async function stopPostgrest() {
  if (!postgrest) return;
  postgrest.kill();
  await new Promise((r) => setTimeout(r, 500));
  postgrest = null;
}

/** Supabase serves PostgREST under /rest/v1; supabase-js and the purge call expect that path. */
const proxy = http.createServer((req, res) => {
  const target = (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/";
  const upstream = http.request(
    { host: "127.0.0.1", port: REST_PORT, path: target, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${REST_PORT}` } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "read model unavailable (drill outage)" }));
  });
  req.pipe(upstream);
});

function psql(args: string[], database = dbName) {
  const out = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-h", pg.hostname, "-p", pg.port || "5432", "-U", pg.username || "postgres", "-d", database, ...args], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`psql failed: ${out.stderr}`);
  return out.stdout;
}

function resetDatabase() {
  psql(["-c", `drop database if exists ${dbName}`, "-c", `create database ${dbName}`], "postgres");
  psql(["-f", path.join(repo, "supabase-readmodel/tests/bootstrap_roles.sql")]);
  for (const file of spawnSync("ls", [path.join(repo, "supabase-readmodel/supabase/migrations")], { encoding: "utf8" }).stdout.split("\n").filter((f) => f.endsWith(".sql")).sort()) {
    psql(["-f", path.join(repo, "supabase-readmodel/supabase/migrations", file)]);
  }
}

// ---------------------------------------------------------------- emulator seed

const USERS = ["drill-a", "drill-b"];
const DURESS = "drill-a_duress";

async function clearEmulator() {
  const res = await fetch(`http://${emulator}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`could not clear the emulator: HTTP ${res.status}`);
}

async function seed(db: Firestore) {
  const fx = fullLedgerFixture() as unknown as Record<string, Record<string, unknown>[]>;
  const created = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);
  for (const uid of [...USERS, DURESS]) {
    await db.doc(`users/${uid}`).set({ createdAt: created });
    for (const spec of READ_MODEL_TABLES) {
      for (const row of fx[spec.collection] ?? []) {
        const { id, ...data } = row;
        await db.doc(`users/${uid}/${spec.collection}/${String(id)}`).set({ ...data, createdAt: created, updatedAt: created });
      }
    }
  }
  await db.doc("system_settings/global").set({ maintenanceMode: false, defaultCurrency: "INR", readModel: { journal: "shadow" } });
}

/** Every Firestore document of every synced collection, per user. */
async function readSource(db: Firestore): Promise<Map<string, Map<string, SourceDoc[]>>> {
  const out = new Map<string, Map<string, SourceDoc[]>>();
  for (const userRef of await db.collection("users").listDocuments()) {
    const byCollection = new Map<string, SourceDoc[]>();
    for (const spec of READ_MODEL_TABLES) {
      const snap = await db.collection(`users/${userRef.id}/${spec.collection}`).get();
      byCollection.set(spec.collection, snap.docs.map((d) => ({ id: d.id, data: d.data(), updateTime: d.updateTime.toMillis() })));
    }
    out.set(userRef.id, byCollection);
  }
  return out;
}

async function readModel(client: SupabaseClient): Promise<Map<string, ModelRow[]>> {
  const out = new Map<string, ModelRow[]>();
  for (const spec of READ_MODEL_TABLES) {
    const rows: ModelRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(spec.table).select("*").order("uid").order("doc_id").range(from, from + 999);
      if (error) throw new Error(`${spec.table}: ${error.message}`);
      rows.push(...((data ?? []) as ModelRow[]));
      if ((data ?? []).length < 1000) break;
    }
    out.set(spec.table, rows);
  }
  return out;
}

async function check(db: Firestore, client: SupabaseClient, purgedUids?: Set<string>): Promise<ConvergenceReport> {
  return convergence({ specs: READ_MODEL_TABLES, source: await readSource(db), model: await readModel(client), purgedUids });
}

// ---------------------------------------------------------------- the production scripts

const scriptEnv = () => ({
  ...process.env,
  READMODEL_SUPABASE_URL: API_URL,
  READMODEL_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  FIRESTORE_EMULATOR_HOST: emulator,
  GCLOUD_PROJECT: project,
  GITHUB_STEP_SUMMARY: "",
});

/**
 * Async on purpose: the /rest/v1 proxy runs in this process, so a blocking
 * spawnSync would freeze the event loop and the script could never reach it.
 */
function runScript(script: string, args: string[]): Promise<{ status: number; output: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", path.join("scripts", script), ...args], { cwd: repo, env: scriptEnv(), shell: true });
    let output = "";
    child.stdout.on("data", (b) => (output += String(b)));
    child.stderr.on("data", (b) => (output += String(b)));
    child.on("close", (code) => resolve({ status: code ?? 1, output, ms: Date.now() - started }));
  });
}

const readsOf = (output: string) => Number(/reads (\d+) \/ budget/.exec(output)?.[1] ?? NaN);

// ---------------------------------------------------------------- drills

async function main() {
  await new Promise<void>((r) => proxy.listen(API_PORT, "127.0.0.1", () => r()));
  const db = getFirestore(initializeApp({ projectId: project }));
  const client = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  log("setup", `emulator ${emulator} (${project}), Postgres ${pg.hostname}:${pg.port}/${dbName}, PostgREST via ${API_URL}`);

  // D1 — rebuild from scratch.
  {
    const d = "D1 rebuild";
    await stopPostgrest();
    resetDatabase();
    await startPostgrest();
    log(d, "read-model database dropped and recreated; every migration applied");
    await clearEmulator();
    await seed(db);
    log(d, `emulator seeded: ${USERS.join(", ")} with the SPENDLY-503 golden ledger, plus a duress tree`);
    const dry = await runScript("readmodel-sync.ts", ["--mode=full", "--dry-run"]);
    log(d, `dry run first: exit ${dry.status}, reads ${readsOf(dry.output)}`);
    const full = await runScript("readmodel-sync.ts", ["--mode=full"]);
    log(d, `full sync (the backfill): exit ${full.status}, ${full.ms} ms, Firestore reads ${readsOf(full.output)}`);
    const verify = await runScript("readmodel-verify.ts", []);
    log(d, `count parity (readmodel-verify): exit ${verify.status}`);
    const report = await check(db, client);
    result(d, "zero divergence after a rebuild from nothing", `${summarizeConvergence(report)}; sync ${full.ms} ms, ${readsOf(full.output)} reads; verify exit ${verify.status}`,
      report.converged && full.status === 0 && verify.status === 0);
  }

  // D2 — sync outage while writes continue (option C has no trigger: the "trigger outage" is the sync not running).
  {
    const d = "D2 sync outage";
    const now = Timestamp.now();
    const a = "drill-a";
    await db.doc(`users/${a}/expenses/new1`).set({ amount: 321.5, date: "2026-10-20", month: "2026-10", category: "Food & Groceries", accountId: "bank", createdAt: now, updatedAt: now });
    await db.doc(`users/${a}/expenses/e1`).update({ amount: 1250, updatedAt: now });
    await db.doc(`users/${a}/expenses/e2`).update({ deletedAt: new Date().toISOString(), updatedAt: now });
    await db.doc(`users/${a}/expenses/c3`).delete();
    await db.doc(`users/${a}/accountTransfers/t2`).delete();
    log(d, "with the sync stopped: 1 expense added, 1 edited, 1 soft-deleted, 1 expense and 1 transfer hard-deleted");
    const before = await check(db, client);
    log(d, `before catching up: ${summarizeConvergence(before)}`);
    const inc = await runScript("readmodel-sync.ts", ["--mode=incremental"]);
    const afterInc = await check(db, client);
    const leftover = afterInc.issues.map((i) => `${i.kind} ${i.table}/${i.docId}`).join(", ");
    log(d, `incremental run: exit ${inc.status}, reads ${readsOf(inc.output)}; ${summarizeConvergence(afterInc)}${leftover ? ` (${leftover})` : ""}`);
    const full = await runScript("readmodel-sync.ts", ["--mode=full"]);
    const afterFull = await check(db, client);
    result(d,
      "the 3-hourly run catches up adds, edits, soft deletes and (always-full) transfer deletes; the nightly full run tombstones the hard-deleted expense; then zero divergence",
      `incremental left: ${leftover || "nothing"}; after the full run: ${summarizeConvergence(afterFull)}`,
      inc.status === 0 && full.status === 0 && afterFull.converged && afterInc.issues.every((i) => i.kind === "extra" && i.docId === "c3"));
  }

  // D3 — read model unavailable.
  {
    const d = "D3 Supabase outage";
    await stopPostgrest();
    log(d, "PostgREST stopped: the API answers 503, like a paused or unreachable project");
    const failed = await runScript("readmodel-sync.ts", ["--mode=incremental"]);
    log(d, `sync during the outage: exit ${failed.status} (non-zero fails the GitHub job, which alerts)`);
    await db.doc("users/drill-b/expenses/during-outage").set({ amount: 99, date: "2026-10-21", month: "2026-10", category: "Food & Groceries", accountId: "bank", createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await startPostgrest();
    log(d, "PostgREST restarted; one expense was written during the outage");
    const inc = await runScript("readmodel-sync.ts", ["--mode=incremental"]);
    const report = await check(db, client);
    result(d, "the sync fails loudly during the outage and converges on the next run; the app side is proven by lib/readModel/outageDrill.test.ts",
      `outage run exit ${failed.status}; next run exit ${inc.status}; ${summarizeConvergence(report)}`,
      failed.status !== 0 && inc.status === 0 && report.converged);
  }

  // D4 — kill switch: every screen to firestore and back, settings preserved, no release.
  {
    const d = "D4 kill switch";
    for (const screen of READ_MODEL_SCREENS) await runScript("readmodel-set-mode.ts", [`--screen=${screen}`, "--mode=firestore", "--apply"]);
    const off = (await db.doc("system_settings/global").get()).data() ?? {};
    const allOff = READ_MODEL_SCREENS.every((s) => (off.readModel as Record<string, unknown>)?.[s] === "firestore");
    log(d, `every screen set to firestore: ${JSON.stringify(off.readModel)}`);
    for (const screen of READ_MODEL_SCREENS) await runScript("readmodel-set-mode.ts", [`--screen=${screen}`, "--mode=shadow", "--apply"]);
    const back = (await db.doc("system_settings/global").get()).data() ?? {};
    const allBack = READ_MODEL_SCREENS.every((s) => (back.readModel as Record<string, unknown>)?.[s] === "shadow");
    const kept = back.maintenanceMode === false && back.defaultCurrency === "INR";
    result(d, "all screens flip to firestore and back by changing one remote document; other settings untouched",
      `off: ${allOff}; back to shadow: ${allBack}; other settings kept: ${kept}`, allOff && allBack && kept);
  }

  // D5 — a bad mapping deploy, detected, rolled back, repaired.
  {
    const d = "D5 bad mapping";
    const bad: TableSpec[] = READ_MODEL_TABLES.map((spec) =>
      spec.table !== "expenses" ? spec : { ...spec, fields: spec.fields.map((f) => (f.column === "amount" ? { ...f, source: "amountTypo" } : f)) }
    );
    const now = Timestamp.now();
    await db.doc("users/drill-b/expenses/after-bad-deploy").set({ amount: 42, date: "2026-10-22", month: "2026-10", category: "Food & Groceries", accountId: "bank", createdAt: now, updatedAt: now });
    const badRun = await runSync(firestoreReader(db), supabaseSink(client), {
      mode: "full", dryRun: false, maxReadsPerRun: 6000, maxReadsPerDay: 1_000_000, now: () => Date.now(), tables: bad,
    });
    const broken = await check(db, client);
    const brokenAmounts = broken.issues.filter((i) => i.kind === "differs" && i.columns.includes("amount")).length;
    log(d, `"deployed" a mapper that reads expenses.amount from the wrong field and ran the nightly full sync: ${badRun.status}, ${badRun.upserts} upserts`);
    log(d, `detected by field parity against the correct mapper: ${summarizeConvergence(broken)} (${brokenAmounts} expense amounts wrong)`);
    const dq = psql(["-t", "-A", "-c", "select count(*) from public.v_data_quality"]).trim();
    log(d, `v_data_quality (health check input) now lists ${dq} row(s)`);
    // Rollback = the correct code again. Its first full run repairs every
    // diverged row and still exits non-zero, because repaired parity
    // mismatches are reported as failures (so a repair always alerts).
    const fixed = await runScript("readmodel-sync.ts", ["--mode=full"]);
    const repaired = await check(db, client);
    log(d, `rolled back; first full run: exit ${fixed.status} (repairs reported as failures); ${summarizeConvergence(repaired)}`);
    const clean = await runScript("readmodel-sync.ts", ["--mode=full"]);
    const after = await check(db, client);
    result(d, "the bad deploy alerts at once (its own run is partial, parity failures, non-zero exit) and shows in v_data_quality; rolling back and running the full sync repairs every row; the run after that is clean",
      `bad run: ${badRun.status}, ${badRun.failures} parity failures; ${brokenAmounts} rows wrong, detected; rollback run exit ${fixed.status} → ${summarizeConvergence(repaired)}; next run exit ${clean.status}`,
      badRun.status !== "succeeded" && brokenAmounts > 0 && repaired.converged && clean.status === 0 && after.converged);
  }

  // D6 — account deletion purge.
  {
    const d = "D6 account purge";
    const purged = await purgeReadModel("drill-b", { url: API_URL, serviceRoleKey: SERVICE_KEY });
    log(d, `purge for drill-b (the delete-account function's call): ${JSON.stringify(purged)}`);
    const resync = await runScript("readmodel-sync.ts", ["--mode=full"]);
    const purgeNote = resync.output.split("\n").find((line) => line.includes("[PURGED]")) ?? "no purge note";
    log(d, `full sync with drill-b's Firestore data still present: exit ${resync.status}; ${purgeNote.trim()}`);
    const report = await check(db, client, new Set(["drill-b"]));
    const others = await check(db, client);
    const otherUserFine = others.issues.every((i) => i.kind === "missing");
    result(d, "every drill-b row is erased; a later full sync (Firestore still holding drill-b) does not bring it back; drill-a untouched",
      `purge ${JSON.stringify(purged)}; resync exit ${resync.status}; ${summarizeConvergence(report)}; drill-a intact: ${otherUserFine}`,
      purged.rows > 0 && resync.status === 0 && resync.output.includes("[PURGED] skipped 1") && report.converged && otherUserFine);
  }

  // D7 — per-write push (SPENDLY-583), through the same wiring as the Netlify function.
  {
    const d = "D7 per-write push";
    const ports = livePushPorts({
      db, client, enabled: true, limit: 120, maxReadsPerDay: 1_000_000,
      // The drill's "token" is the uid; signature checks are covered by the function's unit tests.
      verifyIdToken: async (token) => ({ uid: token }),
    });
    const push = (uid: string, body: unknown) =>
      handleReadModelPush({ httpMethod: "POST", headers: { authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }, ports)
        .catch((error: unknown) => ({ statusCode: 599, headers: {}, body: String(error) }));
    const row = async (id: string) =>
      (await client.from("expenses").select("doc_id, amount, source_deleted").eq("uid", "drill-a").eq("doc_id", id).maybeSingle()).data as
        { amount: number; source_deleted: boolean } | null;
    const ref = { collection: "expenses", docId: "pushed1" };
    const now = () => Timestamp.now();

    await db.doc("users/drill-a/expenses/pushed1").set({ amount: 77, date: "2026-10-23", month: "2026-10", category: "Food & Groceries", accountId: "bank", createdAt: now(), updatedAt: now() });
    const created = await push("drill-a", { refs: [ref] });
    const afterCreate = await row("pushed1");
    log(d, `new expense pushed: HTTP ${created.statusCode}; read model amount ${afterCreate?.amount}`);

    await db.doc("users/drill-a/expenses/pushed1").update({ amount: 78, updatedAt: now() });
    const edited = await push("drill-a", { refs: [ref], data: { amount: 999999 } });
    const afterEdit = await row("pushed1");
    log(d, `edit pushed (request also carried fake data): HTTP ${edited.statusCode}; read model amount ${afterEdit?.amount}`);

    await db.doc("users/drill-a/expenses/pushed1").delete();
    const deleted = await push("drill-a", { refs: [ref] });
    const afterDelete = await row("pushed1");
    log(d, `hard delete pushed: HTTP ${deleted.statusCode}; tombstoned ${afterDelete?.source_deleted}`);

    const erased = await push("drill-b", { refs: [{ collection: "expenses", docId: "e1" }] });
    log(d, `push for the erased account drill-b: HTTP ${erased.statusCode}`);

    await db.doc("users/drill-a/expenses/usersync1").set({ amount: 12, date: "2026-10-23", month: "2026-10", category: "Food & Groceries", accountId: "bank", createdAt: now(), updatedAt: now() });
    const userSync = await push("drill-a", { mode: "user" });
    const afterUserSync = await row("usersync1");
    const lastRun = (await client.from("sync_runs").select("mode, notes").order("id", { ascending: false }).limit(1).single()).data as { notes: { trigger?: string } };
    log(d, `"something changed" push (per-user sync): HTTP ${userSync.statusCode}; usersync1 copied: ${!!afterUserSync}; run trigger ${lastRun?.notes?.trigger}`);

    await stopPostgrest();
    await db.doc("users/drill-a/expenses/usersync1").update({ amount: 13, updatedAt: now() });
    const outage = await push("drill-a", { refs: [{ collection: "expenses", docId: "usersync1" }] });
    await startPostgrest();
    log(d, `push during a read-model outage: HTTP ${outage.statusCode} (the save in Firestore is unaffected)`);
    const nightly = await runScript("readmodel-sync.ts", ["--mode=full"]);
    const report = await check(db, client, new Set(["drill-b"]));
    const quota = (await client.from("push_daily").select("requests, docs, user_syncs, rejected, failed").limit(1).single()).data;
    log(d, `nightly full run after the outage: exit ${nightly.status}; ${summarizeConvergence(report)}; push_daily ${JSON.stringify(quota)}`);

    result(d,
      "a saved expense, its edit and its hard delete reach the read model in one push each; fake data in a request is ignored; an erased account is refused; a per-user push copies an unnamed change; a push during an outage fails without affecting Firestore and the nightly run converges",
      `create ${created.statusCode}→${afterCreate?.amount}, edit ${edited.statusCode}→${afterEdit?.amount}, delete ${deleted.statusCode}→tombstoned ${afterDelete?.source_deleted}, erased ${erased.statusCode}, user sync ${userSync.statusCode} (${lastRun?.notes?.trigger}), outage ${outage.statusCode}, nightly ${nightly.status}: ${summarizeConvergence(report)}`,
      created.statusCode === 200 && Number(afterCreate?.amount) === 77 &&
      edited.statusCode === 200 && Number(afterEdit?.amount) === 78 &&
      deleted.statusCode === 200 && afterDelete?.source_deleted === true &&
      erased.statusCode === 403 &&
      userSync.statusCode === 200 && !!afterUserSync && lastRun?.notes?.trigger === "push" &&
      outage.statusCode >= 500 &&
      nightly.status === 0 && report.converged);
  }

  await stopPostgrest();
  proxy.close();

  const md = [
    "| Drill | Expected | Observed | Result |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.drill} | ${r.expected} | ${r.observed} | ${r.pass ? "PASS" : "**FAIL**"} |`),
    "",
    "```",
    ...lines,
    "```",
  ].join("\n");
  writeFileSync(process.env.DRILL_LOG ?? path.join(workDir, "drill-log.md"), md);
  const failedDrills = results.filter((r) => !r.pass);
  console.log(failedDrills.length ? `\n${failedDrills.length} drill(s) FAILED` : "\nall drills passed");
  process.exit(failedDrills.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack : error);
  await stopPostgrest();
  process.exit(1);
});
