import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DELETE_PHASES, EMPTY_DELETE_COUNTS, deletePhaseLabel, nextDeletePhase } from "../../shared/utils/deleteAccountRemote";
import { ReadModelPurgeNotConfigured } from "./_readmodelPurge";
import { DELETE_BATCH, LIST_PAGE, isOwnFilePath, purgeUserFiles, userFileRoots } from "./_spendlyFilesPurge";

/**
 * SPENDLY-711 — account deletion removes the account's stored files from the
 * `spendly-files` bucket. A fake Storage API: listing is one folder level at a
 * time (objects have an `id`, folders don't), paged by `limit`/`offset`, and
 * delete takes up to 1000 object names.
 */

const env = { url: "https://rm.supabase.co/", serviceRoleKey: "service-key" };

class FakeStorage {
  readonly objects = new Set<string>();
  readonly calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
  failWith: number | null = null;

  constructor(paths: string[]) {
    for (const p of paths) this.objects.add(p);
  }

  fetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    this.calls.push({ method: init.method, url, body });
    expect(init.headers).toMatchObject({ apikey: "service-key", Authorization: "Bearer service-key" });
    if (this.failWith) return { ok: false, status: this.failWith, json: async () => ({ message: "internal detail" }) };
    if (init.method === "POST") {
      expect(url).toBe("https://rm.supabase.co/storage/v1/object/list/spendly-files");
      return { ok: true, status: 200, json: async () => this.list(body.prefix as string, body.limit as number, body.offset as number) };
    }
    expect(init.method).toBe("DELETE");
    expect(url).toBe("https://rm.supabase.co/storage/v1/object/spendly-files");
    const names = body.prefixes as string[];
    expect(names.length).toBeLessThanOrEqual(DELETE_BATCH);
    for (const name of names) this.objects.delete(name);
    return { ok: true, status: 200, json: async () => names.map((name) => ({ name })) };
  };

  private list(prefix: string, limit: number, offset: number) {
    const entries = new Map<string, { name: string; id: string | null }>();
    for (const p of [...this.objects].sort()) {
      if (!p.startsWith(`${prefix}/`)) continue;
      const rest = p.slice(prefix.length + 1);
      const [head, ...tail] = rest.split("/");
      entries.set(head, { name: head, id: tail.length === 0 ? `id-${p}` : null });
    }
    return [...entries.values()].slice(offset, offset + limit);
  }
}

const forever = { deadlineMs: Number.MAX_SAFE_INTEGER };

describe("purgeUserFiles", () => {
  it("removes every file of the account and its duress twin, and nobody else's", async () => {
    const storage = new FakeStorage([
      "users/u1/accounts/a1/d1/statement.pdf",
      "users/u1/accounts/a1/d2/form16.pdf",
      "users/u1/goals/g1/i1/image.jpg",
      "users/u1/tax/t1/ais.pdf",
      "users/u1_duress/accounts/a9/d9/decoy.pdf",
      "users/u10/accounts/a1/d1/other.pdf",
      "users/u1x/goals/g1/i1/image.jpg",
      "users/u2/accounts/a1/d1/other.pdf",
    ]);
    const first = await purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch });
    expect(first).toEqual({ deleted: 5, done: false });
    // A second run confirms nothing is left.
    expect(await purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch })).toEqual({ deleted: 0, done: true });
    expect([...storage.objects].sort()).toEqual([
      "users/u10/accounts/a1/d1/other.pdf",
      "users/u1x/goals/g1/i1/image.jpg",
      "users/u2/accounts/a1/d1/other.pdf",
    ]);
  });

  it("is done at once, and harmless to repeat, for an account with no files", async () => {
    const storage = new FakeStorage(["users/u2/accounts/a/d/x.pdf"]);
    for (let i = 0; i < 2; i += 1) {
      expect(await purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch })).toEqual({ deleted: 0, done: true });
    }
    expect(storage.calls.every((c) => c.method === "POST")).toBe(true);
    expect(storage.objects.size).toBe(1);
  });

  it("pages large folders and deletes in batches of at most 1000", async () => {
    const paths = Array.from({ length: LIST_PAGE + 501 }, (_, i) => `users/u1/goals/g${String(i).padStart(5, "0")}`);
    const storage = new FakeStorage(paths);
    const result = await purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch });
    expect(result).toEqual({ deleted: paths.length, done: false });
    expect(storage.objects.size).toBe(0);
    const deletes = storage.calls.filter((c) => c.method === "DELETE");
    expect(deletes.map((c) => (c.body.prefixes as string[]).length)).toEqual([1000, 501]);
  });

  it("stops at the deadline and converges when the phase runs again", async () => {
    const paths = Array.from({ length: 30 }, (_, i) => `users/u1/accounts/a${i}/d/f.pdf`);
    const storage = new FakeStorage(paths);
    let clock = 0;
    // Every request takes 1 "ms"; the budget ends after a few folder listings.
    const timed = async (...args: Parameters<FakeStorage["fetch"]>) => {
      clock += 1;
      return storage.fetch(...args);
    };
    const partial = await purgeUserFiles("u1", env, { deadlineMs: 5, now: () => clock, fetchImpl: timed });
    expect(partial.done).toBe(false);
    expect(storage.objects.size).toBe(30 - partial.deleted);
    let rounds = 0;
    for (let done = false; !done; rounds += 1) {
      const deadline = clock + 1_000;
      ({ done } = await purgeUserFiles("u1", env, { deadlineMs: deadline, now: () => clock, fetchImpl: timed }));
      expect(rounds).toBeLessThan(5);
    }
    expect(storage.objects.size).toBe(0);
  });

  it("throws on an outage, without provider detail, so the phase is retried and Auth isn't deleted", async () => {
    const storage = new FakeStorage(["users/u1/accounts/a/d/x.pdf"]);
    storage.failWith = 503;
    const run = purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch });
    await expect(run).rejects.toThrow(/HTTP 503/);
    await expect(purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch })).rejects.not.toThrow(/internal detail/);
    storage.failWith = null;
    expect(await purgeUserFiles("u1", env, { ...forever, fetchImpl: storage.fetch })).toEqual({ deleted: 1, done: false });
  });

  it("throws on a listing that isn't a list", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ error: "nope" }) });
    await expect(purgeUserFiles("u1", env, { ...forever, fetchImpl })).rejects.toThrow(/invalid response/);
  });

  it("fails closed without the settings, so Auth is never deleted with files left behind", async () => {
    const storage = new FakeStorage([]);
    for (const partial of [{}, { url: "https://x.supabase.co" }, { serviceRoleKey: "k" }]) {
      await expect(purgeUserFiles("u1", partial, { ...forever, fetchImpl: storage.fetch })).rejects.toBeInstanceOf(
        ReadModelPurgeNotConfigured
      );
    }
    expect(storage.calls).toEqual([]);
  });
});

describe("path safety", () => {
  it("covers exactly the account and its duress twin", () => {
    expect(userFileRoots("u1")).toEqual(["users/u1", "users/u1_duress"]);
  });

  it("refuses an empty or path-like uid before any request", () => {
    for (const bad of ["", "a/b", " u1", "u1 "]) expect(() => userFileRoots(bad)).toThrow();
  });

  it("accepts only paths strictly inside the account's folders", () => {
    const roots = userFileRoots("u1");
    expect(isOwnFilePath("users/u1/accounts/a/d/x.pdf", roots)).toBe(true);
    expect(isOwnFilePath("users/u1_duress/x.pdf", roots)).toBe(true);
    for (const bad of ["users/u1", "users/u1/", "users/u10/x.pdf", "users/u2/x.pdf", "users/u1/../u2/x.pdf", "users/u1//x", "other/u1/x"]) {
      expect(isOwnFilePath(bad, roots), bad).toBe(false);
    }
  });
});

describe("delete-account wiring", () => {
  const source = readFileSync(path.resolve(__dirname, "delete-account.ts"), "utf8");

  it("runs after both Firestore trees and before the read model and Auth", () => {
    expect(nextDeletePhase("duress-tree")).toBe("files");
    expect(nextDeletePhase("files")).toBe("readmodel");
    expect(DELETE_PHASES.indexOf("files")).toBeLessThan(DELETE_PHASES.indexOf("auth"));
    expect(deletePhaseLabel("files")).toMatch(/documents/);
    expect(EMPTY_DELETE_COUNTS.files).toBe(0);
  });

  it("uses the verified uid and the phase budget, and finishes only when nothing is left", () => {
    expect(source).toMatch(
      /case "files":[\s\S]*?purgeUserFiles\(uid, readModelPurgeEnv\(\), \{ deadlineMs: startedAt \+ PHASE_BUDGET_MS \}\)[\s\S]*?finished = files\.done;/
    );
  });

  it("the auth phase checks for files before deleting the login, even if a client skips `files`", () => {
    const auth = source.slice(source.indexOf('case "auth":'), source.indexOf('case "complete":'));
    const filesAt = auth.indexOf("purgeUserFiles(uid, readModelPurgeEnv()");
    const guardAt = auth.indexOf("if (!files.done) break;");
    const deleteAt = auth.indexOf("deleteUser(uid)");
    expect(filesAt).toBeGreaterThan(0);
    expect(guardAt).toBeGreaterThan(filesAt);
    expect(guardAt).toBeLessThan(deleteAt);
  });
});
