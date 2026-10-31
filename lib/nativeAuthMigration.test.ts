import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      disk.set(key, value);
    },
    removeItem: async (key: string) => {
      disk.delete(key);
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { firebase: { apiKey: "AIzaReal" } },
  isLocalTestMode: () => false,
}));

vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));

const { NATIVE_AUTH_ENABLED, resolveNativeAuthMigration } = await import("@/lib/nativeAuthMigration");

const LEGACY = "firebase:authUser:AIzaReal:[DEFAULT]";

describe("resolveNativeAuthMigration (SPENDLY-636)", () => {
  beforeEach(() => {
    disk.clear();
  });

  it("is off on web and in tests (native builds resolve nativeAuthFlag.native.ts)", () => {
    expect(NATIVE_AUTH_ENABLED).toBe(false);
  });

  it("does nothing and touches nothing while disabled", async () => {
    disk.set(LEGACY, "{}");
    await expect(resolveNativeAuthMigration({ enabled: false, nativeUserPresent: false })).resolves.toEqual({
      showReSignInNotice: false,
      clearLegacySession: false,
    });
    expect(disk.has(LEGACY)).toBe(true);
  });

  it("shows the note to someone with an old JS-SDK session", async () => {
    disk.set(LEGACY, "{}");
    const decision = await resolveNativeAuthMigration({ enabled: true, nativeUserPresent: false });
    expect(decision.showReSignInNotice).toBe(true);
    expect(disk.has(LEGACY)).toBe(true);
  });

  it("removes the old record once they are signed in natively", async () => {
    disk.set(LEGACY, "{}");
    const decision = await resolveNativeAuthMigration({ enabled: true, nativeUserPresent: true });
    expect(decision.showReSignInNotice).toBe(false);
    expect(disk.has(LEGACY)).toBe(false);
  });

  it("shows nothing on a fresh install", async () => {
    const decision = await resolveNativeAuthMigration({ enabled: true, nativeUserPresent: false });
    expect(decision.showReSignInNotice).toBe(false);
  });
});
