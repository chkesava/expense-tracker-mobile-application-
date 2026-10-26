import { describe, expect, it } from "vitest";

import { saveGoalsEnabled } from "./saveGoalsFlag";

describe("Save Goals rollout flag (SPENDLY-615)", () => {
  it("is off by default in production builds", () => {
    expect(saveGoalsEnabled({}, false, "u1")).toBe(false);
    expect(saveGoalsEnabled({ enableSaveGoals: "true" }, false, "u1")).toBe(false);
  });

  it("stages 1–2: only allow-listed users", () => {
    const system = { enableSaveGoalsFor: ["tester", "u2"] };
    expect(saveGoalsEnabled(system, false, "tester")).toBe(true);
    expect(saveGoalsEnabled(system, false, "u1")).toBe(false);
    expect(saveGoalsEnabled(system, false, null)).toBe(false);
    expect(saveGoalsEnabled({ enableSaveGoalsFor: "tester" }, false, "tester")).toBe(false);
  });

  it("stage 3: everyone; development builds always", () => {
    expect(saveGoalsEnabled({ enableSaveGoals: true }, false, "anyone")).toBe(true);
    expect(saveGoalsEnabled({}, true, null)).toBe(true);
  });

  it("rollback: clearing both switches hides the screens again", () => {
    expect(saveGoalsEnabled({ enableSaveGoals: false, enableSaveGoalsFor: [] }, false, "tester")).toBe(false);
  });
});
