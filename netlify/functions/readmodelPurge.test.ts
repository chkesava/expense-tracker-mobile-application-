import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { PURGE_NOT_CONFIGURED_MESSAGE, purgeReadModel, ReadModelPurgeNotConfigured, readModelPurgeEnv } from "./_readmodelPurge";
import { DELETE_PHASES, nextDeletePhase } from "../../shared/utils/deleteAccountRemote";

const env = { url: "https://rm.supabase.co/", serviceRoleKey: "service-key" };

describe("read-model purge on account deletion (SPENDLY-508)", () => {
  it("calls readmodel_purge_user for the verified uid with the service role", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ rows: 23, tables: {} }) }));
    await expect(purgeReadModel("user-a", env, fetchImpl)).resolves.toEqual({ rows: 23 });
    expect(fetchImpl).toHaveBeenCalledWith("https://rm.supabase.co/rest/v1/rpc/readmodel_purge_user", {
      method: "POST",
      headers: { apikey: "service-key", Authorization: "Bearer service-key", "Content-Type": "application/json" },
      body: JSON.stringify({ p_uid: "user-a" }),
    });
  });

  it("a second purge succeeds with zero rows", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ rows: 0, tables: {} }) }));
    await expect(purgeReadModel("user-a", env, fetchImpl)).resolves.toEqual({ rows: 0 });
  });

  it("throws on an outage so the phase is retried and Auth is not deleted", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ message: "internal detail" }) }));
    await expect(purgeReadModel("user-a", env, fetchImpl)).rejects.toThrow(/HTTP 503/);
    await expect(purgeReadModel("user-a", env, fetchImpl)).rejects.not.toThrow(/internal detail/);
    const network = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    await expect(purgeReadModel("user-a", env, network)).rejects.toThrow();
  });

  it("fails closed when the site lacks the read-model settings, so Auth is never deleted with data left behind", async () => {
    const fetchImpl = vi.fn();
    for (const env of [{}, { url: "https://x.supabase.co" }, { serviceRoleKey: "k" }]) {
      await expect(purgeReadModel("user-a", env, fetchImpl)).rejects.toBeInstanceOf(ReadModelPurgeNotConfigured);
    }
    await expect(purgeReadModel("user-a", {}, fetchImpl)).rejects.toThrow(PURGE_NOT_CONFIGURED_MESSAGE);
    expect(PURGE_NOT_CONFIGURED_MESSAGE).not.toMatch(/READMODEL|Supabase|env/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readModelPurgeEnv({} as NodeJS.ProcessEnv)).toEqual({ url: undefined, serviceRoleKey: undefined });
  });

  it("runs after both Firestore trees and before Auth is deleted", () => {
    expect(nextDeletePhase("duress-tree")).toBe("readmodel");
    expect(nextDeletePhase("readmodel")).toBe("auth");
    expect(DELETE_PHASES.indexOf("readmodel")).toBeLessThan(DELETE_PHASES.indexOf("auth"));
  });

  it("delete-account wires the phase to the verified uid, never a request field", () => {
    const source = readFileSync(path.resolve(__dirname, "delete-account.ts"), "utf8");
    expect(source).toMatch(/case "readmodel":[\s\S]*?purgeReadModel\(uid, readModelPurgeEnv\(\)\)/);
  });
});
