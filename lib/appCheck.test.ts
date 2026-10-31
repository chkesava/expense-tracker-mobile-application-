import { beforeEach, describe, expect, it, vi } from "vitest";

const initializeAppCheck = vi.fn(async () => ({}));
const nativeApp = { name: "[DEFAULT]" };

vi.mock("@react-native-firebase/app", () => ({ getApp: () => nativeApp }));
vi.mock("@react-native-firebase/app-check", () => ({ initializeAppCheck }));
vi.mock("@/lib/env", () => ({ isLocalTestMode: () => false }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));

const { NATIVE_APP_CHECK_ENABLED, initializeFirebaseAppCheck } = await import("@/lib/appCheck");

const jsApp = {} as Parameters<typeof initializeFirebaseAppCheck>[0];

describe("native App Check (SPENDLY-637)", () => {
  beforeEach(() => {
    initializeAppCheck.mockClear();
  });

  it("is off by default and never touches the native module", async () => {
    expect(NATIVE_APP_CHECK_ENABLED).toBe(false);
    initializeFirebaseAppCheck(jsApp);
    await new Promise((r) => setTimeout(r, 0));
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("uses Play Integrity on the native app when enabled", async () => {
    initializeFirebaseAppCheck(jsApp, true);
    await vi.waitFor(() => expect(initializeAppCheck).toHaveBeenCalledTimes(1));
    expect(initializeAppCheck).toHaveBeenCalledWith(nativeApp, {
      provider: { providerOptions: { android: { provider: "playIntegrity" } } },
      isTokenAutoRefreshEnabled: true,
    });
  });
});
