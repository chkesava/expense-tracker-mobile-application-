import { describe, expect, it } from "vitest";

import {
  ADVISOR_MASK,
  maskAdvisorAmounts,
  parseAdvisorText,
} from "./advisorText";

describe("parseAdvisorText", () => {
  it("turns ** markers into bold segments", () => {
    expect(parseAdvisorText("Hello! I am your **AI Advisor**.")).toEqual([
      { text: "Hello! I am your ", bold: false },
      { text: "AI Advisor", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("returns plain text unchanged", () => {
    expect(parseAdvisorText("No markers here")).toEqual([
      { text: "No markers here", bold: false },
    ]);
  });

  it("keeps an unmatched trailing ** as literal text", () => {
    expect(parseAdvisorText("a **b** c **d")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c **d", bold: false },
    ]);
  });

  it("masks amounts only in ghost mode", () => {
    const text = "Spent **INR 28,736** of ₹55,000";
    expect(parseAdvisorText(text).map((s) => s.text).join("")).toBe(
      "Spent INR 28,736 of ₹55,000"
    );
    expect(parseAdvisorText(text, { ghost: true })).toEqual([
      { text: "Spent ", bold: false },
      { text: ADVISOR_MASK, bold: true },
      { text: ` of ${ADVISOR_MASK}`, bold: false },
    ]);
  });
});

describe("maskAdvisorAmounts", () => {
  it("masks symbol, code, Rs and negative amounts", () => {
    expect(
      maskAdvisorAmounts("₹ 1,234.50 | USD 99 | Rs. 400 | INR -2,000 | $5")
    ).toBe(
      `${ADVISOR_MASK} | ${ADVISOR_MASK} | ${ADVISOR_MASK} | ${ADVISOR_MASK} | ${ADVISOR_MASK}`
    );
  });

  it("leaves percentages, counts, years and words alone", () => {
    const text = "Save 15% across 4 vendors in 2026 (ATM fees)";
    expect(maskAdvisorAmounts(text)).toBe(text);
  });
});
