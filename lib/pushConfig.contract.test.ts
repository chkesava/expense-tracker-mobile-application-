/**
 * SPENDLY-223: the build config every remote push depends on.
 *
 * Push goes through the Expo Push Service (docs/PUSH_CREDENTIALS.md). On the
 * device, `getExpoPushTokenAsync` needs the EAS projectId; on Android, FCM
 * needs the expo-notifications plugin and a google-services.json that names
 * the app's package. The FCM v1 key itself lives in the Expo project, never in
 * the repo. These checks fail loudly if a config change would silently stop
 * Spendly from receiving pushes, and pin that the local test build has no FCM.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type Plugin = string | [string, Record<string, unknown>];
type ExpoConfig = {
  slug: string;
  extra?: { eas?: { projectId?: string } };
  android: { package: string; googleServicesFile?: string };
  plugins?: Plugin[];
};

const appConfig = require("../app.config.js") as (ctx: { config: Record<string, unknown> }) => ExpoConfig;
const root = resolve(__dirname, "..");
const base = () => JSON.parse(readFileSync(resolve(root, "app.json"), "utf8")).expo as Record<string, unknown>;
const pluginNames = (c: ExpoConfig) => (c.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
const SPENDLY_PACKAGE = "com.example.expensetracker";

describe("Spendly push build config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const [label, product] of [
    ["Expense build", "expense"],
    ["combined build", ""],
  ] as const) {
    it(`${label}: has the EAS projectId, the notifications plugin and the Spendly package`, () => {
      vi.stubEnv("EXPO_PUBLIC_PRODUCT", product);
      vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", "");
      const config = appConfig({ config: base() });

      expect(config.extra?.eas?.projectId).toMatch(/^[0-9a-f-]{36}$/);
      expect(pluginNames(config)).toContain("expo-notifications");
      expect(config.android.package).toBe(SPENDLY_PACKAGE);
      expect(config.android.googleServicesFile).toBe("./google-services.json");
    });
  }

  it("local test build: points at the emulator-only services file, so it has no FCM", () => {
    vi.stubEnv("EXPO_PUBLIC_PRODUCT", "expense");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", "10.0.2.2");
    const config = appConfig({ config: base() });

    expect(config.android.package).toBe(`${SPENDLY_PACKAGE}.localtest`);
    expect(config.android.googleServicesFile).toBe("./google-services.localtest.json");
  });

  it("no Firebase service-account or FCM key file is checked in", () => {
    const tracked = readFileSync(resolve(root, ".gitignore"), "utf8");
    expect(tracked).toMatch(/\*service-account\*\.json/);
    expect(tracked).toMatch(/\*-firebase-adminsdk-\*\.json/);
  });
});
