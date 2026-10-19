import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-504 — the read model's service-role key must never reach the app
 * bundle. It lives only in GitHub Actions secrets for the sync job
 * (SPENDLY-506). Sibling of services/ganesh/storage/storageSecurity.test.ts.
 */
const root = path.resolve(__dirname, "..");

/** Names reserved for the read model's server-side secrets. */
const READMODEL_SECRET_NAMES = [
  "READMODEL_SUPABASE_SERVICE_ROLE_KEY",
  "READMODEL_SUPABASE_DB_URL",
  "READMODEL_FIREBASE_SERVICE_ACCOUNT",
];

/** Everything that is bundled into the Expo app, plus env templates. */
const APP_DIRS = ["app", "components", "hooks", "lib", "providers", "services", "shared", "features", "theme"];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("read-model secrets (SPENDLY-504)", () => {
  const appSource = APP_DIRS.flatMap((dir) => sourceFiles(path.join(root, dir)))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  it("keeps the read-model server secrets out of app code", () => {
    for (const name of READMODEL_SECRET_NAMES) expect(appSource).not.toContain(name);
  });

  it("never exposes a read-model secret as an EXPO_PUBLIC_ variable", () => {
    const envFiles = [".env.example", "lib/env.ts", "app.config.ts", "app.config.js"]
      .map((rel) => path.join(root, rel))
      .filter(existsSync)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(envFiles).not.toMatch(/EXPO_PUBLIC_[A-Z_]*(READMODEL|SERVICE_ROLE)/);
  });
});
