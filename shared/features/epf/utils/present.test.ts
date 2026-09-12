import { describe, expect, it } from "vitest";

import { statusToneKey } from "@/shared/features/epf/utils/present";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";

describe("statusToneKey", () => {
  it("maps the four tones the EPF status helpers emit", () => {
    expect(statusToneKey("success")).toBe("success");
    expect(statusToneKey("info")).toBe("primary");
    expect(statusToneKey("neutral")).toBe("mutedForeground");
  });

  it("maps warning to destructive, deliberately", () => {
    // The palette has no amber, and an EPF month in a warning tone is a missed
    // or reversed credit. Both copies did this; it is preserved, not fixed.
    expect(statusToneKey("warning")).toBe("destructive");
  });

  it("falls back to muted for an unknown tone rather than throwing", () => {
    expect(statusToneKey("something-new")).toBe("mutedForeground");
  });

  it("has a key for every tone contributionStatusMeta can produce", () => {
    const statuses = [
      "draft",
      "confirmed",
      "expected",
      "credited",
      "partial",
      "missed",
      "reversed",
    ] as const;
    for (const status of statuses) {
      for (const source of ["manualHistorical", "manualCurrent", "simulated", "imported"] as const) {
        for (const reconciled of [true, false]) {
          const meta = contributionStatusMeta(status, source, reconciled);
          expect(statusToneKey(meta.tone)).toMatch(
            /^(success|destructive|primary|mutedForeground)$/
          );
        }
      }
    }
  });
});
