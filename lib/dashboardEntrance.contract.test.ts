import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-717 — on Android the dashboard's Reanimated fade left the "More"
 * cards at opacity 0 for good (Reanimated's synchronous-props path fails for
 * views that aren't mounted yet), so native must never animate a card in.
 * The component imports React Native, so this pins its source rather than
 * rendering it.
 */
const source = readFileSync(
  path.resolve(__dirname, "../components/dashboard/DashboardEntrance.tsx"),
  "utf8"
);

describe("SPENDLY-717 dashboard entrance contract", () => {
  it("only animates on web; native draws a plain View at rest", () => {
    expect(source).toMatch(
      /Platform\.OS === "web" \? <FadeInEntrance \{\.\.\.props\} \/> : <View style=\{props\.style\}>\{props\.children\}<\/View>/
    );
  });

  it("keeps the opacity animation inside the web-only component", () => {
    const fadeStart = source.indexOf("function FadeInEntrance");
    expect(fadeStart).toBeGreaterThan(-1);
    expect(source.indexOf("useSharedValue(")).toBeGreaterThan(fadeStart);
    expect(source.indexOf("opacity: progress.value")).toBeGreaterThan(fadeStart);
  });
});
