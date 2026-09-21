/**
 * SPENDLY-96 regression.
 *
 * v2.0.8/build 93 shipped a startup crash: every launch of the signed-in
 * Expense shell hit AppErrorBoundary with `Error: Cannot find module`.
 *
 * The cause was a bundler resolution gap, not app code.
 * `expo-quick-actions` publishes an `exports` map and nothing else — no
 * `main`, no `module`, no `react-native` field, no root `index.js`. Metro
 * has package exports disabled in this repo (Firebase Auth's RN persistence
 * entry needs the legacy `react-native` field), so it found no entry point
 * and emitted a module that throws the moment anything requires it.
 *
 * These tests pin the alias that closes the gap AND the two conditions that
 * make the alias necessary, so whoever changes either one finds out here
 * rather than from a released APK.
 */

import { existsSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

type ResolverContext = {
  resolveRequest: (
    context: ResolverContext,
    moduleName: string,
    platform: string | null
  ) => unknown;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const metroConfig = require(path.join(ROOT, "metro.config.js")) as {
  resolver: {
    unstable_enablePackageExports?: boolean;
    resolveRequest: (
      context: ResolverContext,
      moduleName: string,
      platform: string | null
    ) => { type: string; filePath: string };
  };
};

/** Stands in for Metro's default resolver so a miss is visible, not silent. */
const context: ResolverContext = {
  resolveRequest: (_context, moduleName) => {
    throw new Error(`fell through to Metro default resolution: ${moduleName}`);
  },
};

describe("expo-quick-actions Metro resolution", () => {
  it("resolves to a real file on android", () => {
    const resolved = metroConfig.resolver.resolveRequest(
      context,
      "expo-quick-actions",
      "android"
    );

    expect(resolved.type).toBe("sourceFile");
    expect(existsSync(resolved.filePath)).toBe(true);
  });

  it("resolves to a real file on ios", () => {
    const resolved = metroConfig.resolver.resolveRequest(
      context,
      "expo-quick-actions",
      "ios"
    );

    expect(resolved.type).toBe("sourceFile");
    expect(existsSync(resolved.filePath)).toBe(true);
  });

  it("leaves web to Metro, which has its own index.web.js", () => {
    expect(() =>
      metroConfig.resolver.resolveRequest(context, "expo-quick-actions", "web")
    ).toThrow(/fell through/);
  });

  it("still routes product-splash-overlay", () => {
    const resolved = metroConfig.resolver.resolveRequest(
      context,
      "product-splash-overlay",
      "android"
    );

    expect(existsSync(resolved.filePath)).toBe(true);
  });
});

describe("why the alias is required", () => {
  it("package exports stay disabled for Firebase Auth", () => {
    // If this flips to true, re-check whether the alias is still needed —
    // and re-check the Firebase Auth persistence warning before removing it.
    expect(metroConfig.resolver.unstable_enablePackageExports).toBe(false);
  });

  it("expo-quick-actions still has no entry point Metro can find", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require("expo-quick-actions/package.json") as Record<string, unknown>;

    expect(pkg.main).toBeUndefined();
    expect(pkg.module).toBeUndefined();
    expect(pkg["react-native"]).toBeUndefined();
    expect(existsSync(path.join(ROOT, "node_modules/expo-quick-actions/index.js"))).toBe(
      false
    );
  });
});
