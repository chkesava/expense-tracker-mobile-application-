import { describe, expect, it, vi } from "vitest";

import { createReadModelConnector, type ReadModelConnectorDeps, type ReadModelUser } from "./readModelClient";

function user(uid: string, claimsSequence: Record<string, unknown>[]): ReadModelUser & { forced: number } {
  let calls = 0;
  const u = {
    uid,
    forced: 0,
    getIdToken: vi.fn(async () => `token-${uid}`),
    getIdTokenResult: vi.fn(async (force?: boolean) => {
      if (force) u.forced += 1;
      const claims = claimsSequence[Math.min(calls, claimsSequence.length - 1)];
      calls += 1;
      return { claims };
    }),
  };
  return u;
}

function deps(overrides: Partial<ReadModelConnectorDeps> = {}) {
  const fetch = vi.fn(async () => ({ ok: true }));
  const createClient = vi.fn((_url: string, _key: string, options: { accessToken: () => Promise<string | null> }) => ({ options }) as never);
  const d: ReadModelConnectorDeps = {
    configured: true,
    localTestMode: false,
    url: "https://rm.supabase.co",
    publishableKey: "sb_publishable_x",
    origin: "https://app.example",
    fetch,
    createClient,
    ...overrides,
  };
  return { d, fetch, createClient };
}

describe("read-model client (SPENDLY-505)", () => {
  it("connects with the user's Firebase ID token as the access token", async () => {
    const { d, createClient, fetch } = deps();
    const u = user("user-a", [{ role: "authenticated" }]);
    const res = await createReadModelConnector(d).connect(u);
    expect(res.access).toBe("ok");
    expect(fetch).not.toHaveBeenCalled();
    const options = createClient.mock.calls[0][2];
    await expect(options.accessToken()).resolves.toBe("token-user-a");
  });

  it("asks the server for the role claim once, then refreshes the token", async () => {
    const { d, fetch } = deps();
    const u = user("user-a", [{}, { role: "authenticated" }]);
    const res = await createReadModelConnector(d).connect(u);
    expect(fetch).toHaveBeenCalledWith(
      "https://app.example/.netlify/functions/readmodel-claims",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer token-user-a" }) })
    );
    expect(u.forced).toBe(1);
    expect(res.client).not.toBeNull();
  });

  it("returns no client when the claim can't be obtained", async () => {
    const { d, createClient } = deps({ fetch: vi.fn(async () => ({ ok: false })) });
    const res = await createReadModelConnector(d).connect(user("user-a", [{}]));
    expect(res).toEqual({ access: "no-role", client: null });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns no client, and makes no network call, for a duress session", async () => {
    const { d, fetch, createClient } = deps();
    const duress = user("user-a_duress", [{ role: "authenticated" }]);
    const res = await createReadModelConnector(d).connect(duress);
    expect(res).toEqual({ access: "duress", client: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(duress.getIdToken).not.toHaveBeenCalled();
  });

  it("returns no client in a local test build, when unconfigured, or signed out", async () => {
    const u = user("user-a", [{ role: "authenticated" }]);
    expect((await createReadModelConnector(deps({ localTestMode: true }).d).connect(u)).access).toBe("test-mode");
    expect((await createReadModelConnector(deps({ configured: false }).d).connect(u)).access).toBe("not-configured");
    expect((await createReadModelConnector(deps().d).connect(null)).access).toBe("signed-out");
  });

  it("reuses the client for the same user and drops it on sign-out or user change", async () => {
    const { d, createClient } = deps();
    const c = createReadModelConnector(d);
    const a = user("user-a", [{ role: "authenticated" }]);
    await c.connect(a);
    await c.connect(a);
    expect(createClient).toHaveBeenCalledTimes(1);
    await c.connect(user("user-b", [{ role: "authenticated" }]));
    expect(createClient).toHaveBeenCalledTimes(2);
    await c.connect(null);
    await c.connect(a);
    expect(createClient).toHaveBeenCalledTimes(3);
  });

  it("switching into duress drops the real user's client", async () => {
    const { d } = deps();
    const c = createReadModelConnector(d);
    expect((await c.connect(user("user-a", [{ role: "authenticated" }]))).client).not.toBeNull();
    expect((await c.connect(user("user-a_duress", [{ role: "authenticated" }]))).client).toBeNull();
  });
});
