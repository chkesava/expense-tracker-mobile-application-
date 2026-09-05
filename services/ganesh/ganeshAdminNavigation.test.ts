import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const ADMIN_DIR = path.join(ROOT, "app/(ganesh)/admin");
const TABS_DIR = path.join(ROOT, "app/(ganesh)/(tabs)");

function adminSources(dir = ADMIN_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return adminSources(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/** Screen names declared under the (tabs) group, minus the layout. */
function tabScreens(): string[] {
  return fs
    .readdirSync(TABS_DIR)
    .filter((name) => name.endsWith(".tsx") && name !== "_layout.tsx")
    .map((name) => name.replace(/\.tsx$/, ""));
}

/** Prose mentions old hrefs on purpose (see the GS-100 note in `admin/index.tsx`). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * GS-099 asked whether an Admin cross-link into a tab route unwinds the stack,
 * so Back exits to Home instead of returning to Admin. It does not, and these
 * are the two properties that keep it that way.
 *
 * `(tabs)` is a sibling of `admin` in `app/(ganesh)/_layout.tsx` and already
 * sits below it. Expo Router's `findDivergentState` targets the navigator where
 * the requested path and the current state diverge — the `(ganesh)` stack — and
 * because that navigator is a stack, a `push` stays a `PUSH`, which
 * `StackRouter` appends as a new entry rather than reusing the one underneath.
 * Admin stays on the stack, so Back returns to it.
 *
 * `navigate` or `replace` would not hold that guarantee, and an href missing
 * the `(tabs)` segment matches no declared route at all (GS-100 found five such
 * links in `admin/reports.tsx`) and lands on `+not-found`.
 */
describe("ganesh admin cross-link navigation", () => {
  it("addresses tab screens through the (tabs) group", () => {
    const tabs = tabScreens();
    const offenders: string[] = [];

    for (const file of adminSources()) {
      const source = stripComments(fs.readFileSync(file, "utf8"));
      for (const match of source.matchAll(/["'`]\/\(ganesh\)\/(?!\(tabs\))([a-z-]+)/g)) {
        if (tabs.includes(match[1])) {
          offenders.push(`${path.relative(ROOT, file)}: /(ganesh)/${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("pushes tab routes rather than navigating or replacing", () => {
    const offenders: string[] = [];

    for (const file of adminSources()) {
      const source = stripComments(fs.readFileSync(file, "utf8"));
      for (const match of source.matchAll(
        /\b(push|navigate|replace)\(\s*["'`]\/\(ganesh\)\/\(tabs\)\/([a-z-]+)/g,
      )) {
        if (match[1] !== "push") {
          offenders.push(`${path.relative(ROOT, file)}: ${match[1]}("/(ganesh)/(tabs)/${match[2]}")`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the dynamic admin hrefs typed and pushed", () => {
    const source = fs.readFileSync(path.join(ADMIN_DIR, "index.tsx"), "utf8");

    // A `Href`, not a `string`, so a route rename is a compile error (GS-100).
    expect(source).toMatch(/href:\s*Href;/);
    // Pushed without a cast, or the typing above buys nothing at the call site.
    expect(source).toContain("push(item.href)");
  });
});
