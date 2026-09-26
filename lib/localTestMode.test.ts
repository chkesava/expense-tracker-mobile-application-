/**
 * SPENDLY-175: local test builds talk only to the Firebase emulator, install
 * as a separate app, and can never become a release.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isUrlAllowedInTestMode } from "@/lib/networkGuard";

const require = createRequire(import.meta.url);
const { localTestBuildBlocker, LOCAL_TEST_ENV_KEY } = require("../scripts/common.js") as {
  localTestBuildBlocker: (input: {
    envFileVars: Record<string, string>;
    processEnv: Record<string, string | undefined>;
    buildGradle: string;
  }) => string | null;
  LOCAL_TEST_ENV_KEY: string;
};

const EMULATOR = "127.0.0.1";

describe("isUrlAllowedInTestMode", () => {
  it("allows the emulator host", () => {
    expect(isUrlAllowedInTestMode("http://127.0.0.1:8080/v1/projects", EMULATOR)).toBe(true);
    expect(isUrlAllowedInTestMode("http://127.0.0.1:9099/identitytoolkit", EMULATOR)).toBe(true);
  });

  it("blocks production and third-party hosts", () => {
    for (const url of [
      "https://firestore.googleapis.com/v1/projects/x",
      "https://spendly.netlify.app/.netlify/functions/delete-account",
      "https://abc.supabase.co/functions/v1/spendly-files",
      "https://world.openfoodfacts.org/api/v2/product/1",
      "http://127.0.0.2:8080/",
    ]) {
      expect(isUrlAllowedInTestMode(url, EMULATOR)).toBe(false);
    }
  });

  it("never blocks local reads", () => {
    for (const url of ["file:///data/receipt.jpg", "content://media/1", "data:image/png;base64,AA"]) {
      expect(isUrlAllowedInTestMode(url, EMULATOR)).toBe(true);
    }
  });
});

describe("isLocalTestMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is off unless the emulator host is set", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", "");
    vi.resetModules();
    const envModule = await import("@/lib/env");
    expect(envModule.isLocalTestMode()).toBe(false);
  });

  it("turns on with the host, needs no production keys, and disables Supabase", async () => {
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", EMULATOR);
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "key");
    vi.resetModules();
    const envModule = await import("@/lib/env");
    expect(envModule.isLocalTestMode()).toBe(true);
    expect(envModule.isFirebaseEnvConfigured()).toBe(true);
    expect(envModule.isSupabaseEnvConfigured()).toBe(false);
    expect(envModule.LOCAL_TEST_PROJECT_ID.startsWith("demo-")).toBe(true);
  });
});

describe("app.config.js test app", () => {
  const appConfig = require("../app.config.js") as (ctx: { config: Record<string, unknown> }) => {
    name: string;
    scheme: string;
    android: { package: string; googleServicesFile?: string };
    plugins?: unknown[];
  };
  const base = () =>
    JSON.parse(readFileSync(resolve(__dirname, "../app.json"), "utf8")).expo as Record<string, unknown>;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves the real Expense app untouched without the flag", () => {
    vi.stubEnv("EXPO_PUBLIC_PRODUCT", "expense");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", "");
    const cfg = appConfig({ config: base() });
    expect(cfg.android.package).toBe("com.example.expensetracker");
    expect(cfg.android.googleServicesFile).toBe("./google-services.json");
    expect(cfg.name).toBe("Spendly");
    // The real app never allows cleartext http.
    expect(JSON.stringify(cfg.plugins)).not.toContain("withLocalTestCleartext");
  });

  it("returns the combined config object itself when nothing is set", () => {
    vi.stubEnv("EXPO_PUBLIC_PRODUCT", "");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", "");
    const config = base();
    expect(appConfig({ config })).toBe(config);
  });

  it("turns into a separate Spendly Test app with the flag", () => {
    vi.stubEnv("EXPO_PUBLIC_PRODUCT", "expense");
    vi.stubEnv("EXPO_PUBLIC_FIREBASE_EMULATOR_HOST", EMULATOR);
    const cfg = appConfig({ config: base() });
    expect(cfg.android.package).toBe("com.example.expensetracker.localtest");
    expect(cfg.android.googleServicesFile).toBeUndefined();
    expect(cfg.name).toBe("Spendly Test");
    expect(cfg.scheme).toBe("spendly-test");
    expect(JSON.stringify(cfg.plugins)).toContain("withLocalTestCleartext");
  });
});

describe("localTestBuildBlocker (release guard)", () => {
  const clean = {
    envFileVars: {},
    processEnv: {},
    buildGradle: "applicationId 'com.example.expensetracker'",
  };

  it("lets a normal release through", () => {
    expect(localTestBuildBlocker(clean)).toBeNull();
  });

  it("refuses the emulator flag from an env file or the environment", () => {
    expect(
      localTestBuildBlocker({ ...clean, envFileVars: { [LOCAL_TEST_ENV_KEY]: EMULATOR } })
    ).toMatch(/env/);
    expect(
      localTestBuildBlocker({ ...clean, processEnv: { [LOCAL_TEST_ENV_KEY]: EMULATOR } })
    ).toMatch(/environment/);
  });

  it("refuses an android/ project generated for the test app", () => {
    expect(
      localTestBuildBlocker({
        ...clean,
        buildGradle: "applicationId 'com.example.expensetracker.localtest'",
      })
    ).toMatch(/local test app/);
  });
});

describe("seed-emulator.js", () => {
  const seedModule = require("../scripts/seed-emulator.js") as {
    seedSafetyBlocker: (input: { firestoreHost?: string; authHost?: string; projectId?: string }) => string | null;
    buildDemoData: (today?: Date) => {
      userDoc: Record<string, unknown>;
      collections: Record<string, { id: string; data: Record<string, unknown> }[]>;
    };
    EXPENSE_TEMPLATES: [string, string, ...unknown[]][];
    SUBSCRIPTIONS: [string, number, string, string, ...unknown[]][];
    BUDGETS: [string, number][];
  };

  it("refuses anything but a local demo emulator", () => {
    const ok = { firestoreHost: "127.0.0.1:8080", authHost: "127.0.0.1:9099", projectId: "demo-spendly" };
    expect(seedModule.seedSafetyBlocker(ok)).toBeNull();
    expect(seedModule.seedSafetyBlocker({ ...ok, firestoreHost: undefined })).toMatch(/FIRESTORE/);
    expect(seedModule.seedSafetyBlocker({ ...ok, firestoreHost: "firestore.googleapis.com:443" })).toMatch(/FIRESTORE/);
    expect(seedModule.seedSafetyBlocker({ ...ok, authHost: "" })).toMatch(/AUTH/);
    expect(seedModule.seedSafetyBlocker({ ...ok, projectId: "expense-tracker-prod" })).toMatch(/demo-/);
  });

  it("uses only category pairs that exist in the taxonomy", async () => {
    const { CATEGORY_TAXONOMY } = await import("@/shared/data/categoryTaxonomy");
    const pairs = new Set(
      CATEGORY_TAXONOMY.flatMap((parent) =>
        parent.subcategories.map((sub) => `${parent.name}::${typeof sub === "string" ? sub : sub.name}`)
      )
    );
    for (const [category, subcategory] of seedModule.EXPENSE_TEMPLATES) {
      expect(pairs, `${category} / ${subcategory}`).toContain(`${category}::${subcategory}`);
    }
    for (const [, , category, subcategory] of seedModule.SUBSCRIPTIONS) {
      expect(pairs, `${category} / ${subcategory}`).toContain(`${category}::${subcategory}`);
    }
    const parents = new Set(CATEGORY_TAXONOMY.map((parent) => parent.name));
    for (const [category] of seedModule.BUDGETS) expect(parents).toContain(category);
  });

  it("builds rows the app will actually show", () => {
    const today = new Date(2026, 8, 26, 12);
    const { collections, userDoc } = seedModule.buildDemoData(today);
    const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;

    expect(collections.expenses.length).toBeGreaterThan(100);
    for (const row of [...collections.expenses, ...collections.incomes]) {
      expect(typeof row.data.amount).toBe("number");
      expect(row.data.amount as number).toBeGreaterThanOrEqual(0);
      expect(row.data.date).toMatch(ymdPattern);
      expect(row.data.month).toBe((row.data.date as string).slice(0, 7));
      expect(row.data.createdAt).toBeInstanceOf(Date);
      expect(row.data).not.toHaveProperty("deletedAt");
      expect((row.data.createdAt as Date).getTime()).toBeLessThanOrEqual(today.getTime());
    }
    // Rows in the current month exist, so the Dashboard is not empty.
    expect(collections.expenses.some((row) => row.data.month === "2026-09")).toBe(true);
    // Already processed this month: the app will not auto-post them on load.
    for (const sub of collections.subscriptions) expect(sub.data.lastProcessed).toBe("2026-09");
    // Every expense points at a seeded account.
    const accountIds = new Set(collections.accounts.map((a) => a.id));
    for (const row of collections.expenses) expect(accountIds).toContain(row.data.accountId);
    // Straight to the Dashboard, no onboarding.
    expect(userDoc.onboarding).toMatchObject({ welcomeCompleted: true, onboardingDismissed: true, setupStartedAt: "" });
  });
});

describe("withLocalTestCleartext", () => {
  const { networkSecurityXml } = require("../plugins/withLocalTestCleartext.js") as {
    networkSecurityXml: (hosts: string[]) => string;
  };

  it("permits cleartext only for the listed emulator hosts", () => {
    const xml = networkSecurityXml(["127.0.0.1", "localhost"]);
    expect(xml).toContain('<domain-config cleartextTrafficPermitted="true">');
    expect(xml).toContain("<domain includeSubdomains=\"false\">127.0.0.1</domain>");
    // No base-config: every other host keeps the https-only default.
    expect(xml).not.toContain("base-config");
  });
});
