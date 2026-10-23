import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-513 — `transactions/[id]` mounts no unbounded `ledgerEvents`
 * listener in `supabase` mode. The tests run in node (no React renderer), so
 * this pins the structure instead:
 * - the screen reads audit events only through `useLedgerEvents({ docId })`;
 * - in `useLedgerEvents`, the one-transaction read-model branch (the
 *   `readModelPages` strategy, see ledgerEventPages.test.ts) returns before
 *   the only `onSnapshot`, so no listener is created on that path.
 */
const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("transactions/[id] audit in supabase mode (SPENDLY-513)", () => {
  it("the screen subscribes to nothing on ledgerEvents itself; it uses useLedgerEvents with a docId", () => {
    const screen = read("app/(app)/transactions/[id].tsx");
    expect(screen).not.toMatch(/ledgerEvents["'`]/);
    expect(screen).toMatch(/useLedgerEvents\(\{[^}]*docId: ref\?\.id/);
  });

  it("the read-model branch returns before the hook's only listener", () => {
    const hook = read("hooks/useLedgerEvents.ts");
    const listeners = hook.match(/onSnapshot\(/g) ?? [];
    expect(listeners).toHaveLength(1);
    const branch = hook.indexOf("if (pagedFromReadModel && user) {");
    const listener = hook.indexOf("onSnapshot(");
    expect(branch).toBeGreaterThan(0);
    expect(branch).toBeLessThan(listener);
    const body = hook.slice(branch, listener);
    // The branch ends in its own cleanup return, so control never reaches onSnapshot.
    expect(body).toMatch(/return \(\) => \{\s*cancelled = true;\s*\};\s*\}\s*$/m);
    expect(hook).toMatch(/const pagedFromReadModel = strategy === "readModelPages";/);
  });
});
