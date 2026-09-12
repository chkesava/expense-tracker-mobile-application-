import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import unitConfig from "@/vitest.config";
import rulesConfig from "@/vitest.rules.config";

/**
 * A test file outside every include glob is skipped silently — KAN-73.
 *
 * `vitest.config.ts` runs only `shared/`, `services/`, `lib/` and
 * `supabase/functions/`, and `vitest.rules.config.ts` runs `firestore/`. A test
 * written anywhere else — `hooks/`, `components/`, `app/`, `netlify/` — is
 * never collected, never fails, and never reports that it did not run. CI stays
 * green while the suite quietly shrinks.
 *
 * Every tracked test file is in scope today. This keeps it that way by turning
 * a silent skip into a red build, and it reads the globs from the real configs
 * rather than restating them, so the two cannot drift apart.
 */

const REPO_ROOT = path.resolve(__dirname, "../..");

/** Directories that are not source: build output, deps, agent scratch space. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  ".claude",
  "dist",
  "build",
  "android",
  "ios",
  "coverage",
  "netlify/functions-dist",
]);

function includeGlobs(config: unknown): string[] {
  const include = (config as { test?: { include?: string[] } }).test?.include;
  if (!include || include.length === 0) {
    throw new Error("a vitest config reported no include globs — refusing to pass vacuously");
  }
  return include;
}

/** Enough glob support for the patterns these configs actually use. */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("**/")
    .map((part) =>
      part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
    )
    .join("(?:.*/)?");
  return new RegExp(`^${source}$`);
}

function findTestFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel)) continue;
      findTestFiles(full, acc);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      acc.push(rel);
    }
  }
  return acc;
}

describe("every test file is actually run by some config", () => {
  const patterns = [...includeGlobs(unitConfig), ...includeGlobs(rulesConfig)].map(globToRegExp);
  const testFiles = findTestFiles(REPO_ROOT);

  it("finds the test files at all — a broken walk must not pass vacuously", () => {
    expect(testFiles.length).toBeGreaterThan(100);
    expect(testFiles).toContain("shared/config/testScope.test.ts");
  });

  it("matches this very file, proving the glob translation works", () => {
    expect(patterns.some((p) => p.test("shared/config/testScope.test.ts"))).toBe(true);
  });

  it("would reject a test file placed outside every include glob", () => {
    // The failure this guard exists to catch: a perfectly good test in hooks/
    // that never runs. If this ever starts matching, the guard is toothless.
    expect(patterns.some((p) => p.test("hooks/useEpfContributions.test.ts"))).toBe(false);
    expect(patterns.some((p) => p.test("components/epf/EpfBalanceTab.test.tsx"))).toBe(false);
  });

  it("leaves no test file unrun", () => {
    const orphans = testFiles.filter((file) => !patterns.some((p) => p.test(file)));

    expect(
      orphans,
      orphans.length === 0
        ? ""
        : `These test files match no include glob, so they never run:\n  ${orphans.join(
            "\n  "
          )}\nEither move them under a directory the configs cover, or add a glob to vitest.config.ts.`
    ).toEqual([]);
  });
});
