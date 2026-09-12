import { describe, expect, it } from "vitest";

import { monthLabel } from "@/shared/utils/monthLabel";

describe("monthLabel", () => {
  it("defaults to short names, which three of the four copies used", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthLabel("2026-01")).toBe("Jan 2026");
    expect(monthLabel("2026-12")).toBe("Dec 2026");
  });

  it("renders long names on request, as EpfCurrentMonthCard needs", () => {
    expect(monthLabel("2026-09", "long")).toBe("September 2026");
    expect(monthLabel("2026-01", "long")).toBe("January 2026");
    expect(monthLabel("2026-12", "long")).toBe("December 2026");
  });

  it("agrees with itself across styles — same month, same year", () => {
    for (let m = 1; m <= 12; m += 1) {
      const key = `2026-${String(m).padStart(2, "0")}`;
      const short = monthLabel(key);
      const long = monthLabel(key, "long");
      expect(long.endsWith("2026")).toBe(true);
      // Every short name is a prefix of its long name, in English.
      expect(long.startsWith(short.split(" ")[0])).toBe(true);
    }
  });

  it("returns a malformed key unchanged rather than inventing a month", () => {
    // This is the point of the fallback: "undefined 2026" looks like data.
    expect(monthLabel("2026-13")).toBe("2026-13");
    expect(monthLabel("2026-00")).toBe("2026-00");
    expect(monthLabel("")).toBe("");
    expect(monthLabel("nonsense")).toBe("nonsense");
  });

  it("handles every valid month without falling through", () => {
    const labels = Array.from({ length: 12 }, (_, i) =>
      monthLabel(`2026-${String(i + 1).padStart(2, "0")}`)
    );
    expect(new Set(labels).size).toBe(12);
    expect(labels.some((l) => l.startsWith("2026-"))).toBe(false);
  });
});
