import { describe, expect, it } from "vitest";

import { toGluestackVars, toRgbTriplet } from "./gluestackVars";
import { THEME_NAMES, createTheme } from "./tokens";

describe("toRgbTriplet", () => {
  it("parses long, short and alpha hex", () => {
    expect(toRgbTriplet("#4F46FF")).toBe("79 70 255");
    expect(toRgbTriplet("#fff")).toBe("255 255 255");
    expect(toRgbTriplet("#00000080")).toBe("0 0 0");
  });

  it("parses rgb/rgba and drops alpha", () => {
    expect(toRgbTriplet("rgba(15, 23, 42, 0.5)")).toBe("15 23 42");
    expect(toRgbTriplet("rgb(1 2 3)")).toBe("1 2 3");
  });

  it("rejects anything else", () => {
    expect(toRgbTriplet("transparent")).toBeNull();
    expect(toRgbTriplet("#12")).toBeNull();
  });
});

describe("toGluestackVars", () => {
  it("drives --primary from the selected accent", () => {
    const indigo = toGluestackVars(createTheme("light", "indigo"));
    const slate = toGluestackVars(createTheme("light", "slate"));
    expect(indigo["--primary"]).toBe("79 70 255");
    expect(slate["--primary"]).toBe("51 65 85");
  });

  it("follows the dark palette", () => {
    const dark = toGluestackVars(createTheme("dark"));
    expect(dark["--background"]).toBe("8 10 20");
    expect(dark["--card"]).toBe("12 15 26");
  });

  it("produces every variable for every theme", () => {
    for (const name of THEME_NAMES) {
      const vars = toGluestackVars(createTheme(name));
      expect(Object.keys(vars)).toHaveLength(28);
      for (const value of Object.values(vars)) {
        expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
      }
    }
  });
});
