import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { resolveAndroidBackAction } from "@/shared/config/navigation";
import { isRestorableRoute } from "@/shared/config/routeRestoration";

/**
 * SPENDLY-651: a new route is registered in all three places
 * (docs/AGENT_WORKFLOW.md §6): the Stack.Screen, the sub-screen list (Android
 * back pops it) and the restorable routes. It is reachable from the Markets tab.
 */
const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");

describe("/screener route", () => {
  it("has a Stack.Screen in the app layout", () => {
    expect(read("app/(app)/_layout.tsx")).toMatch(/<Stack\.Screen\s+name="screener"/);
  });

  it("is a sub-screen that Android back pops, and can be restored", () => {
    expect(resolveAndroidBackAction("/screener")).toBe("pop");
    expect(isRestorableRoute("/screener")).toBe(true);
  });

  it("is linked from the Markets tab", () => {
    expect(read("components/markets/MarketsDashboard.tsx")).toContain('router.push("/screener" as Href)');
  });

  it("stays inside the Expense app's investments gate", () => {
    expect(read("app/(app)/screener.tsx")).toMatch(/enableInvestments && system\.enableInvestments/);
  });
});
