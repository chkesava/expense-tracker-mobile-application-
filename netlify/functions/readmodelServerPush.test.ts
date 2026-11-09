import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { READ_MODEL_TABLES } from "../../shared/utils/readModel/mapping";
import { createServerPush, trackServerBatch, type ServerPushPorts } from "./_readmodelServerPush";

function fakePorts(over: Partial<ServerPushPorts> = {}) {
  const upserts: { table: string; ids: string[] }[] = [];
  const tombstones: { table: string; ids: string[] }[] = [];
  const ports: ServerPushPorts = {
    isPurged: async () => false,
    readDocs: async (_uid, refs) => refs.map((r) => (r.docId.startsWith("gone") ? null : { id: r.docId, data: { amount: 1 }, updateTime: Date.now() })),
    upsert: async (table, rows) => (upserts.push({ table, ids: rows.map((r) => String(r.doc_id)) }), rows.length),
    tombstone: async (table, _uid, ids) => (tombstones.push({ table, ids }), ids.length),
    log: vi.fn(),
    ...over,
  };
  return { ports, upserts, tombstones };
}

describe("server-side writers copy what they wrote (SPENDLY-680)", () => {
  it("copies the noted documents, once each, and tombstones one that's gone", async () => {
    const f = fakePorts();
    const push = createServerPush(f.ports);
    push.note("u1", ["users/u1/epfContributions/c1", "users/u1/epfContributions/c1", "users/u1/epfContributionEvents/ev1", "users/u1/epfContributions/gone1"]);
    const result = await push.flush();
    expect(result).toEqual({ pushed: 2, tombstoned: 1, failed: 0, skipped: null });
    expect(f.upserts.flatMap((u) => u.ids).sort()).toEqual(["c1", "ev1"]);
    expect(f.tombstones).toEqual([{ table: "epf_contributions", ids: ["gone1"] }]);
  });

  it("ignores duress trees, another user's paths and unsynced collections; skips erased accounts", async () => {
    const f = fakePorts({ isPurged: async (uid) => uid === "erased" });
    const push = createServerPush(f.ports);
    push.note("u1_duress", ["users/u1_duress/epfContributions/c1"]);
    push.note("u1", ["users/u2/epfContributions/c1", "users/u1/notSynced/x", "users/u1/epfContributions/c2"]);
    push.note("erased", ["users/erased/epfContributions/c3"]);
    await push.flush();
    expect(f.upserts.flatMap((u) => u.ids)).toEqual(["c2"]);
  });

  it("pages large writes in chunks the push accepts", async () => {
    const f = fakePorts();
    const push = createServerPush(f.ports);
    push.note("u1", Array.from({ length: 120 }, (_, i) => `users/u1/epfContributions/c${i}`));
    const result = await push.flush();
    expect(result.pushed).toBe(120);
    expect(f.upserts.map((u) => u.ids.length)).toEqual([50, 50, 20]);
  });

  it("never throws: a failure is counted and logged, and the next account still goes", async () => {
    const f = fakePorts({
      readDocs: async (uid, refs) => {
        if (uid === "bad") throw new Error("supabase down");
        return refs.map((r) => ({ id: r.docId, data: {}, updateTime: Date.now() }));
      },
    });
    const push = createServerPush(f.ports);
    push.note("bad", ["users/bad/epfContributions/c1"]);
    push.note("good", ["users/good/epfContributions/c1"]);
    const result = await push.flush();
    expect(result).toMatchObject({ pushed: 1, failed: 1 });
    expect(f.ports.log).toHaveBeenCalledTimes(1);
  });

  it("without read-model settings it copies nothing and says the nightly sync will", async () => {
    const push = createServerPush(null);
    push.note("u1", ["users/u1/epfContributions/c1"]);
    expect((await push.flush()).skipped).toMatch(/nightly sync/);
    expect((await push.flush()).skipped).toBeNull(); // nothing left
  });

  it("trackServerBatch records every written path and passes the calls through", async () => {
    const calls: string[] = [];
    const inner = {
      set: (ref: { path: string }) => calls.push(`set ${ref.path}`),
      update: (ref: { path: string }) => calls.push(`update ${ref.path}`),
      create: (ref: { path: string }) => calls.push(`create ${ref.path}`),
      delete: (ref: { path: string }) => calls.push(`delete ${ref.path}`),
      commit: async () => calls.push("commit"),
    };
    const batch = trackServerBatch(inner);
    batch.set({ path: "users/u1/a/1" });
    batch.update({ path: "users/u1/a/2" });
    batch.create({ path: "users/u1/a/3" });
    batch.delete({ path: "users/u1/a/1" });
    await batch.commit();
    expect(calls).toEqual(["set users/u1/a/1", "update users/u1/a/2", "create users/u1/a/3", "delete users/u1/a/1", "commit"]);
    expect(batch.writtenPaths()).toEqual(["users/u1/a/1", "users/u1/a/2", "users/u1/a/3"]);
  });
});

/**
 * Guard: a server-side writer of a synced collection (Netlify functions,
 * scripts) must copy what it wrote to the read model, or say why not.
 */
describe("every server-side writer of a synced collection pushes (SPENDLY-680)", () => {
  const ROOT = join(__dirname, "..", "..");
  const SYNCED = READ_MODEL_TABLES.filter((t) => !t.root).map((t) => t.collection.split("/")[0]);
  const ALLOWED: Record<string, string> = {
    // The read model's own tooling writes Supabase, or only the drill emulator.
    "scripts/readmodel-drill.ts": "the recovery drill (emulator only)",
    "scripts/lib/readmodelSyncCore.ts": "the sync itself",
    // Deletes the whole account and purges the read model for it (SPENDLY-508).
    "netlify/functions/delete-account.ts": "account deletion purges the read model",
    // The push core: it is the copy.
    "netlify/functions/_readmodelPushCore.ts": "the push itself",
    "netlify/functions/readmodel-push.ts": "the push itself",
    // SPENDLY-726: daily job cores write through `applyJobWrites`, which notes
    // every committed path to the push its CLI creates (pinned below).
    "scripts/lib/sipDailyCore.ts": "writes via applyJobWrites; sip-daily.ts creates the push",
    "scripts/lib/billDailyCore.ts": "writes via applyJobWrites; bill-daily.ts creates the push",
    // SPENDLY-739 (epic SPENDLY-735).
    "scripts/lib/subscriptionDailyCore.ts": "writes via applyJobWrites; subscription-daily.ts creates the push",
  };
  const PUSHES = /\bcreateServerPush\(|\breadModel\b[^\n]*serverPushPorts|\bserverPushPorts\(/;

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...sources(full));
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
    }
    return out;
  }

  it("finds the server writers, and each pushes or is allowed", () => {
    const constants = new Map<string, string>();
    for (const file of sources(join(ROOT, "shared"))) {
      for (const m of readFileSync(file, "utf8").matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*"(\w+)"/g)) constants.set(m[1], m[2]);
    }
    const writers: string[] = [];
    const missing: string[] = [];
    for (const file of [...sources(join(ROOT, "netlify", "functions")), ...sources(join(ROOT, "scripts"))]) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      const text = readFileSync(file, "utf8");
      if (!/\.(set|update|create|delete)\(/.test(text)) continue;
      // `users/${uid}/<collection>` paths, literal or through a name constant.
      const named = [...text.matchAll(/users\/\$\{\w+\}\/(?:\$\{(\w+)\}|\$\{collection\}|(\w+))/g)].map((m) => (m[1] ? constants.get(m[1]) : m[2]));
      if (!named.some((c) => c && SYNCED.includes(c)) && !/users\/\$\{\w+\}\/\$\{collection\}/.test(text)) continue;
      writers.push(rel);
      if (!PUSHES.test(text) && !ALLOWED[rel]) missing.push(rel);
    }
    expect(missing, `server writers of synced collections that don't push: ${missing.join(", ")}`).toEqual([]);
    for (const known of ["netlify/functions/epf-cron.ts", "scripts/rebaseline-account.ts", "scripts/lib/rebuildRunner.ts"]) {
      expect(writers).toContain(known);
    }
  });

  // SPENDLY-726: the daily jobs (682) build `JobWrite`s in a pure core and
  // write them through `applyJobWrites`. The core is allowed above because
  // its CLI creates the push; this pins that, so the allowance can't hide a
  // job that doesn't push.
  it("every daily job CLI (scripts/*-daily.ts) creates the server push", () => {
    const clis = readdirSync(join(ROOT, "scripts")).filter((n) => /-daily\.ts$/.test(n));
    expect(clis).toEqual(expect.arrayContaining(["sip-daily.ts", "bill-daily.ts"]));
    const missing = clis.filter((n) => !/\bcreateServerPush\(serverPushPorts\(/.test(readFileSync(join(ROOT, "scripts", n), "utf8")));
    expect(missing, `daily jobs that don't push: ${missing.join(", ")}`).toEqual([]);
  });

  it("the daily job core pushes exactly what it committed", () => {
    const core = readFileSync(join(ROOT, "scripts", "lib", "dailyJobCore.ts"), "utf8");
    expect(core).toMatch(/await batch\.commit\(\);[\s\S]*opts\.push\?\.note\(uid, paths\)/);
  });
});
