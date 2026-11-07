import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SPENDLY-699 — the web export is a single bundle (app.json web.output
 * "single"): a module reached only through a dynamic `import()` isn't in it,
 * and requiring it fails at runtime ("Requiring unknown module"), so the
 * on-device copy never opened on web. The web store and what it imports
 * must use static imports. (The native bundle includes async dependencies,
 * so platformStore.ts may keep its dynamic expo-sqlite import.)
 */
const code = (file: string) =>
  readFileSync(join(__dirname, file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");

describe("the web copy uses static imports only (SPENDLY-699)", () => {
  it.each(["platformStore.web.ts", "idbStore.ts", "sqliteStore.ts", "store.ts", "localCopy.ts"])("%s has no dynamic import()", (file) => {
    expect(code(file)).not.toMatch(/(?<!typeof )\bimport\(\s*["'`]/);
  });

  it("the web store imports idbStore statically", () => {
    expect(code("platformStore.web.ts")).toMatch(/^import \{ idbStoreFactory \} from "\.\/idbStore";/m);
  });
});
