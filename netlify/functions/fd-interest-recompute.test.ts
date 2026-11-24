import { describe, expect, it, vi } from "vitest";

import type { Investment } from "../../shared/types/investment";
import type { JobBatch, JobDb } from "../../scripts/lib/dailyJobCore";
import { handleFdInterestRecompute, type FdInterestRecomputePorts } from "./fd-interest-recompute";

function fd(overrides: Partial<Investment> = {}): Investment {
  return {
    id: "fd1",
    name: "Test FD",
    kind: "fixed_deposit",
    principal: 100000,
    startDate: "2026-01-01",
    annualInterestRate: 7.25,
    interestMethod: "compound",
    creditFrequency: "quarterly",
    status: "active",
    ...overrides,
  };
}

/** Minimal in-memory JobDb: no preconditions needed for this handler's writes. */
function fakeDb(): { db: JobDb; docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: (): JobBatch => ({
      create: (ref, data) => docs.set(ref.path, data),
      set: (ref, data, o) =>
        docs.set(ref.path, o?.merge ? { ...(docs.get(ref.path) ?? {}), ...data } : data),
      update: (ref, data) => docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data }),
      delete: (ref) => docs.delete(ref.path),
      commit: async () => {},
    }),
  };
  return { db, docs };
}

function ports(overrides: Partial<FdInterestRecomputePorts> = {}) {
  const { db, docs } = fakeDb();
  const p: FdInterestRecomputePorts = {
    verifyIdToken: async (token) => {
      if (token === "good") return { uid: "user-a" };
      throw new Error("invalid");
    },
    loadInvestment: async () => fd(),
    db,
    stamp: () => "STAMP",
    push: null,
    today: "2026-01-10",
    ...overrides,
  };
  return { p, docs };
}

const post = (body: unknown, authorization = "Bearer good") => ({
  httpMethod: "POST",
  headers: { Authorization: authorization },
  body: JSON.stringify(body),
});

describe("fd-interest-recompute", () => {
  it("recomputes a valid compound FD and writes through the fake db", async () => {
    const { p, docs } = ports();
    const res = await handleFdInterestRecompute(post({ investmentId: "fd1" }), p);
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(true);
    expect(payload.creditedDays).toBeGreaterThan(0);
    expect(docs.has("users/user-a/investments/fd1/interestCredits/2026-01-10")).toBe(true);
    expect(docs.get("users/user-a/investments/fd1")).toMatchObject({ lastInterestCreditedDate: "2026-01-10" });
  });

  it("returns creditedDays: 0 without writing for a non-compound investment", async () => {
    const { p, docs } = ports({ loadInvestment: async () => fd({ interestMethod: "simple" }) });
    const res = await handleFdInterestRecompute(post({ investmentId: "fd1" }), p);
    expect(JSON.parse(res.body)).toEqual({ ok: true, creditedDays: 0 });
    expect(docs.size).toBe(0);
  });

  it("404s when the investment doesn't exist under this uid", async () => {
    const { p } = ports({ loadInvestment: async () => null });
    const res = await handleFdInterestRecompute(post({ investmentId: "missing" }), p);
    expect(res.statusCode).toBe(404);
  });

  it("rejects a missing or invalid investmentId", async () => {
    const { p } = ports();
    expect((await handleFdInterestRecompute(post({}), p)).statusCode).toBe(400);
    expect((await handleFdInterestRecompute(post({ investmentId: "" }), p)).statusCode).toBe(400);
    expect((await handleFdInterestRecompute(post({ investmentId: 5 }), p)).statusCode).toBe(400);
  });

  it("rejects a missing, malformed or invalid token", async () => {
    const { p } = ports();
    expect((await handleFdInterestRecompute(post({ investmentId: "fd1" }, ""), p)).statusCode).toBe(401);
    expect((await handleFdInterestRecompute(post({ investmentId: "fd1" }, "Basic good"), p)).statusCode).toBe(401);
    expect((await handleFdInterestRecompute(post({ investmentId: "fd1" }, "Bearer forged"), p)).statusCode).toBe(401);
  });

  it("refuses a duress-shaped uid", async () => {
    const { p } = ports({ verifyIdToken: async () => ({ uid: "user-a_duress" }) });
    const res = await handleFdInterestRecompute(post({ investmentId: "fd1" }), p);
    expect(res.statusCode).toBe(403);
  });

  it("never trusts a uid from the request body", async () => {
    const { p, docs } = ports();
    await handleFdInterestRecompute(
      { ...post({ investmentId: "fd1" }), body: JSON.stringify({ investmentId: "fd1", uid: "user-b" }) },
      p
    );
    expect([...docs.keys()].every((k) => k.startsWith("users/user-a/"))).toBe(true);
  });

  it("answers CORS preflight and refuses other methods", async () => {
    const { p } = ports();
    expect((await handleFdInterestRecompute({ httpMethod: "OPTIONS" }, p)).statusCode).toBe(204);
    expect((await handleFdInterestRecompute({ httpMethod: "GET" }, p)).statusCode).toBe(405);
  });

  it("calls the push port with the written paths", async () => {
    const note = vi.fn();
    const { p } = ports({ push: { note } });
    await handleFdInterestRecompute(post({ investmentId: "fd1" }), p);
    expect(note).toHaveBeenCalledWith("user-a", expect.arrayContaining(["users/user-a/investments/fd1/interestCredits/2026-01-10"]));
  });
});
