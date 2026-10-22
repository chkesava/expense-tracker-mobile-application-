import { describe, expect, it } from "vitest";

import {
  bearerToken,
  claimsWithReadModelRole,
  hasReadModelRole,
  readModelAccess,
  readModelClaimsFunctionUrl,
} from "./readModelIdentity";

describe("read-model identity (SPENDLY-505)", () => {
  it("adds the role claim and keeps the claims already there", () => {
    expect(claimsWithReadModelRole(undefined)).toEqual({ role: "authenticated" });
    expect(claimsWithReadModelRole({ admin: true })).toEqual({ admin: true, role: "authenticated" });
  });

  it("is idempotent: nothing to write when the role is already set", () => {
    expect(claimsWithReadModelRole({ role: "authenticated", admin: true })).toBeNull();
  });

  it("overwrites a different role value rather than leaving the user unmapped", () => {
    expect(claimsWithReadModelRole({ role: "anon" })).toEqual({ role: "authenticated" });
  });

  it("refuses claims over Firebase's 1000-byte limit", () => {
    expect(() => claimsWithReadModelRole({ blob: "x".repeat(1000) })).toThrow(/1000-byte/);
    // Bytes, not characters: 400 Devanagari letters are 400 UTF-16 units but 1,200 UTF-8 bytes.
    expect(() => claimsWithReadModelRole({ name: "क".repeat(400) })).toThrow(/1000-byte/);
    expect(claimsWithReadModelRole({ name: "क".repeat(100) })).toMatchObject({ role: "authenticated" });
  });

  it("recognises only the exact role value", () => {
    expect(hasReadModelRole({ role: "authenticated" })).toBe(true);
    expect(hasReadModelRole({ role: "Authenticated" })).toBe(false);
    expect(hasReadModelRole({})).toBe(false);
    expect(hasReadModelRole(null)).toBe(false);
  });

  it("parses only a well-formed bearer header", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBe("");
    expect(bearerToken("Bearer a b")).toBe("");
    expect(bearerToken(undefined)).toBe("");
  });

  it("builds the function URL from the origin", () => {
    expect(readModelClaimsFunctionUrl("https://x.netlify.app/")).toBe("https://x.netlify.app/.netlify/functions/readmodel-claims");
    expect(readModelClaimsFunctionUrl("")).toBe("");
  });

  it("allows the read model only for a configured, real, non-duress session", () => {
    const base = { configured: true, localTestMode: false, uid: "u1" };
    expect(readModelAccess(base)).toBe("ok");
    expect(readModelAccess({ ...base, configured: false })).toBe("not-configured");
    expect(readModelAccess({ ...base, localTestMode: true })).toBe("test-mode");
    expect(readModelAccess({ ...base, uid: null })).toBe("signed-out");
    expect(readModelAccess({ ...base, uid: "u1_duress" })).toBe("duress");
  });
});
