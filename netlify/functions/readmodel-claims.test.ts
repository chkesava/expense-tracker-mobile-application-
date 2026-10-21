import { describe, expect, it, vi } from "vitest";

import { handleReadModelClaims, type ClaimsPorts } from "./readmodel-claims";

function ports(overrides: Partial<ClaimsPorts> = {}, stored: Record<string, unknown> | undefined = undefined) {
  const set = vi.fn(async (_uid: string, _claims: Record<string, unknown>) => {});
  const p: ClaimsPorts = {
    verifyIdToken: async (token) => {
      if (token === "good") return { uid: "user-a" };
      throw new Error("invalid");
    },
    getCustomClaims: async () => stored,
    setCustomClaims: set,
    ...overrides,
  };
  return { p, set };
}

const post = (authorization?: string) => ({
  httpMethod: "POST",
  headers: authorization ? { Authorization: authorization } : {},
});

describe("readmodel-claims (SPENDLY-505)", () => {
  it("sets the role claim for the verified uid, keeping existing claims", async () => {
    const { p, set } = ports({}, { admin: true });
    const res = await handleReadModelClaims(post("Bearer good"), p);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ changed: true });
    expect(set).toHaveBeenCalledWith("user-a", { admin: true, role: "authenticated" });
  });

  it("writes nothing when the claim is already there", async () => {
    const { p, set } = ports({}, { role: "authenticated" });
    const res = await handleReadModelClaims(post("Bearer good"), p);
    expect(JSON.parse(res.body)).toEqual({ changed: false });
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects a missing, malformed, forged, expired or revoked token", async () => {
    const { p, set } = ports();
    expect((await handleReadModelClaims(post(), p)).statusCode).toBe(401);
    expect((await handleReadModelClaims(post("Basic good"), p)).statusCode).toBe(401);
    // verifyIdToken(token, checkRevoked) throws for all of forged/expired/revoked/other-project.
    expect((await handleReadModelClaims(post("Bearer forged"), p)).statusCode).toBe(401);
    expect(set).not.toHaveBeenCalled();
  });

  it("only ever writes the token's uid, whatever the request says", async () => {
    const { p, set } = ports();
    await handleReadModelClaims({ ...post("Bearer good"), body: JSON.stringify({ uid: "user-b" }) } as never, p);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toBe("user-a");
  });

  it("refuses a duress-shaped uid", async () => {
    const { p, set } = ports({ verifyIdToken: async () => ({ uid: "user-a_duress" }) });
    expect((await handleReadModelClaims(post("Bearer good"), p)).statusCode).toBe(403);
    expect(set).not.toHaveBeenCalled();
  });

  it("answers CORS preflight and refuses other methods", async () => {
    const { p } = ports();
    expect((await handleReadModelClaims({ httpMethod: "OPTIONS" }, p)).statusCode).toBe(204);
    expect((await handleReadModelClaims({ httpMethod: "GET" }, p)).statusCode).toBe(405);
  });
});
