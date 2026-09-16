import { describe, expect, it } from "vitest";

import {
  canRunTokenDraw,
  drawRefusalMessage,
  ganeshDrawFunctionUrl,
  resolveDrawOutcome,
} from "./ganeshDrawRemote";

describe("canRunTokenDraw", () => {
  it("allows an admin without inspecting permissions", () => {
    expect(canRunTokenDraw({ status: "active", role: "admin" })).toBe(true);
  });

  it("allows a member carrying draw.run", () => {
    expect(
      canRunTokenDraw({ status: "active", role: "treasurer", permissions: ["draw.run"] })
    ).toBe(true);
  });

  it("refuses a treasurer who only sells tokens", () => {
    expect(
      canRunTokenDraw({
        status: "active",
        role: "treasurer",
        permissions: ["tokens.read", "tokens.write", "tokens.config"],
      })
    ).toBe(false);
  });

  it("refuses the legacy member shape, which predates the permission", () => {
    // `draw.run` did not exist when these documents were written, so there is
    // no legacy shape that could legitimately carry it. A role fallback here
    // would hand the draw to every old treasurer silently.
    expect(canRunTokenDraw({ status: "active", role: "treasurer" })).toBe(false);
  });

  it("refuses anyone not active, and anyone at all", () => {
    expect(
      canRunTokenDraw({ status: "suspended", role: "admin", permissions: ["draw.run"] })
    ).toBe(false);
    expect(canRunTokenDraw({ status: "removed", role: "admin" })).toBe(false);
    expect(canRunTokenDraw(null)).toBe(false);
    expect(canRunTokenDraw(undefined)).toBe(false);
  });

  it("is not fooled by a permissions field that is not an array", () => {
    expect(
      canRunTokenDraw({ status: "active", role: "member", permissions: "draw.run" })
    ).toBe(false);
  });
});

describe("resolveDrawOutcome", () => {
  const open = { sessionStatus: "open", plannedDraws: 10, completedDraws: 2, eligibleCount: 50 };

  it("allows a draw and numbers it next in sequence", () => {
    const outcome = resolveDrawOutcome(open);
    expect(outcome.canDraw).toBe(true);
    expect(outcome.sequence).toBe(3);
  });

  it("starts at sequence 1", () => {
    expect(resolveDrawOutcome({ ...open, completedDraws: 0 }).sequence).toBe(1);
  });

  it("refuses once every configured draw has run", () => {
    const outcome = resolveDrawOutcome({ ...open, completedDraws: 10 });
    expect(outcome.canDraw).toBe(false);
    expect(outcome.refusal).toBe("complete");
  });

  it("refuses past the planned count, not just at it", () => {
    // Guards the re-entrancy case: a retry that arrives after the session was
    // already filled must not add an eleventh winner.
    expect(resolveDrawOutcome({ ...open, completedDraws: 11 }).refusal).toBe("complete");
  });

  it("refuses when the pot is empty rather than duplicating a winner", () => {
    const outcome = resolveDrawOutcome({ ...open, eligibleCount: 0 });
    expect(outcome.canDraw).toBe(false);
    expect(outcome.refusal).toBe("exhausted");
  });

  it("still draws while fewer tokens remain than draws — the shortfall case", () => {
    // Three tokens and eight draws left: draw the three real winners, then
    // stop. It must not refuse up front, and must not invent the other five.
    const outcome = resolveDrawOutcome({ ...open, eligibleCount: 3 });
    expect(outcome.canDraw).toBe(true);
    expect(outcome.sequence).toBe(3);
  });

  it("refuses a session that is not open", () => {
    for (const status of ["completed", "cancelled", ""]) {
      const outcome = resolveDrawOutcome({ ...open, sessionStatus: status });
      expect(outcome.canDraw).toBe(false);
      expect(outcome.refusal).toBe("closed");
    }
  });

  it("checks the session before anything else", () => {
    // A cancelled session with an empty pot is closed, not exhausted — the
    // message the operator sees should name the real reason.
    expect(
      resolveDrawOutcome({ ...open, sessionStatus: "cancelled", eligibleCount: 0 }).refusal
    ).toBe("closed");
  });

  it("never produces a sequence below 1 from odd stored values", () => {
    expect(resolveDrawOutcome({ ...open, completedDraws: -5 }).sequence).toBe(1);
  });

  it("walks a full draw to completion without gaps or repeats", () => {
    const sequences: number[] = [];
    let completed = 0;
    let eligible = 5;
    for (let i = 0; i < 10; i += 1) {
      const outcome = resolveDrawOutcome({
        sessionStatus: "open",
        plannedDraws: 5,
        completedDraws: completed,
        eligibleCount: eligible,
      });
      if (!outcome.canDraw) break;
      sequences.push(outcome.sequence);
      completed += 1;
      eligible -= 1;
    }
    expect(sequences).toEqual([1, 2, 3, 4, 5]);
  });

  it("stops at the shortfall, leaving the remaining draws unfilled", () => {
    const sequences: number[] = [];
    let completed = 0;
    let eligible = 2;
    for (let i = 0; i < 10; i += 1) {
      const outcome = resolveDrawOutcome({
        sessionStatus: "open",
        plannedDraws: 5,
        completedDraws: completed,
        eligibleCount: eligible,
      });
      if (!outcome.canDraw) {
        expect(outcome.refusal).toBe("exhausted");
        break;
      }
      sequences.push(outcome.sequence);
      completed += 1;
      eligible -= 1;
    }
    // Two tokens, five draws: exactly two winners, and no duplicates.
    expect(sequences).toEqual([1, 2]);
  });
});

describe("drawRefusalMessage", () => {
  it("names the real reason in each case", () => {
    expect(drawRefusalMessage("complete")).toMatch(/Every draw is done/);
    expect(drawRefusalMessage("exhausted")).toMatch(/No Token Laddus are left/);
    expect(drawRefusalMessage("closed")).toMatch(/closed/);
  });
});

describe("ganeshDrawFunctionUrl", () => {
  it("builds the endpoint and tolerates a trailing slash", () => {
    expect(ganeshDrawFunctionUrl("https://example.com")).toBe(
      "https://example.com/.netlify/functions/ganesh-draw"
    );
    expect(ganeshDrawFunctionUrl("https://example.com/")).toBe(
      "https://example.com/.netlify/functions/ganesh-draw"
    );
  });

  it("returns empty when there is no origin, so the caller can refuse", () => {
    expect(ganeshDrawFunctionUrl("")).toBe("");
  });
});
