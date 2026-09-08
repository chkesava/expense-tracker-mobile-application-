import { describe, expect, it } from "vitest";

import {
  canRequestFestivalSummary,
  ganeshSummaryFunctionUrl,
  parseSummaryRemoteMode,
} from "@/shared/utils/ganeshSummaryRemote";

describe("ganeshSummaryFunctionUrl", () => {
  it("points at the Netlify function on the share origin", () => {
    expect(ganeshSummaryFunctionUrl("https://spendly-share.netlify.app")).toBe(
      "https://spendly-share.netlify.app/.netlify/functions/ganesh-summary"
    );
    expect(ganeshSummaryFunctionUrl("https://spendly-share.netlify.app/")).toBe(
      "https://spendly-share.netlify.app/.netlify/functions/ganesh-summary"
    );
    expect(ganeshSummaryFunctionUrl("")).toBe("");
  });
});

describe("canRequestFestivalSummary", () => {
  const collector = { status: "active", role: "collector", permissions: ["collections.create"] };
  const admin = { status: "active", role: "admin", permissions: ["festival.update", "festival.create"] };
  const treasurerLegacy = { status: "active", role: "treasurer" };

  it("lets any active member ask for a ledger rebuild", () => {
    expect(canRequestFestivalSummary("rebuild", collector)).toBe(true);
    expect(canRequestFestivalSummary("rebuild", { status: "suspended", role: "admin" })).toBe(
      false
    );
  });

  it("limits seed and recompute to festival managers", () => {
    expect(canRequestFestivalSummary("seed", collector)).toBe(false);
    expect(canRequestFestivalSummary("seed", admin)).toBe(true);
    expect(canRequestFestivalSummary("recompute", collector)).toBe(false);
    expect(canRequestFestivalSummary("recompute", admin)).toBe(true);
    expect(canRequestFestivalSummary("recompute", treasurerLegacy)).toBe(true);
  });
});

describe("parseSummaryRemoteMode", () => {
  it("accepts only the three modes the function serves", () => {
    expect(parseSummaryRemoteMode("rebuild")).toBe("rebuild");
    expect(parseSummaryRemoteMode("wipe")).toBeNull();
  });
});
