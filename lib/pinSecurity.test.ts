import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// expo-crypto pulls in react-native transitively, which vitest's node
// environment can't parse. Stub it with an equivalent SHA-256 hex digest
// so this test exercises pinSecurity.ts's own logic, not expo-crypto itself.
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: async (_algorithm: string, data: string) =>
    createHash("sha256").update(data).digest("hex"),
}));

const { hashPin, pinMatches } = await import("./pinSecurity");

describe("pinSecurity", () => {
  it("hashes a PIN deterministically as a 64-char hex digest", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different PINs", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("4321");
    expect(a).not.toBe(b);
  });

  it("matches a correct PIN against its hash", async () => {
    const stored = await hashPin("1234");
    expect(await pinMatches("1234", stored)).toBe(true);
  });

  it("rejects an incorrect PIN against a hash", async () => {
    const stored = await hashPin("1234");
    expect(await pinMatches("9999", stored)).toBe(false);
  });

  it("falls back to plaintext comparison for legacy unhashed PINs", async () => {
    expect(await pinMatches("1234", "1234")).toBe(true);
    expect(await pinMatches("9999", "1234")).toBe(false);
  });

  it("never matches when nothing is stored", async () => {
    expect(await pinMatches("1234", "")).toBe(false);
  });
});
