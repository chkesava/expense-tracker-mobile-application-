import { describe, expect, it } from "vitest";

import {
  interpolate,
  placeholdersIn,
  pluralSuffix,
  resolveMessage,
  translate,
  translatePlural,
} from "./runtime";

describe("interpolate", () => {
  it("substitutes named placeholders", () => {
    expect(interpolate("{{actor}} approved {{target}}", { actor: "Ramesh", target: "Sita" })).toBe(
      "Ramesh approved Sita"
    );
  });

  it("substitutes the same placeholder more than once", () => {
    expect(interpolate("{{n}} of {{n}}", { n: 3 })).toBe("3 of 3");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(interpolate("Hello {{ name }}", { name: "Sita" })).toBe("Hello Sita");
  });

  it("leaves an unsupplied placeholder verbatim rather than printing undefined", () => {
    // A committee-facing sentence with a visible {{target}} is a reportable bug;
    // one with a silent blank is not, which is why the token survives.
    expect(interpolate("{{actor}} removed {{target}}", { actor: "Ramesh" })).toBe(
      "Ramesh removed {{target}}"
    );
  });

  it("returns the template untouched when no params are given", () => {
    expect(interpolate("{{actor}} joined")).toBe("{{actor}} joined");
  });

  it("coerces numbers", () => {
    expect(interpolate("{{count}} members", { count: 12 })).toBe("12 members");
  });
});

describe("placeholdersIn", () => {
  it("lists placeholders once each, in first-seen order", () => {
    expect(placeholdersIn("{{b}} then {{a}} then {{b}}")).toEqual(["b", "a"]);
  });

  it("returns nothing for a plain string", () => {
    expect(placeholdersIn("Pandal settings")).toEqual([]);
  });
});

describe("resolveMessage", () => {
  const en = { "a.b": "English B", "a.c": "English C" };

  it("prefers the active catalog", () => {
    expect(resolveMessage("a.b", { "a.b": "తెలుగు" }, en)).toBe("తెలుగు");
  });

  it("falls back per key, not per catalog", () => {
    // The point of the whole design: one untranslated key must not drag the
    // rest of the screen back to English.
    const partial = { "a.b": "తెలుగు" };
    expect(resolveMessage("a.b", partial, en)).toBe("తెలుగు");
    expect(resolveMessage("a.c", partial, en)).toBe("English C");
  });

  it("treats an empty or whitespace-only translation as missing", () => {
    expect(resolveMessage("a.b", { "a.b": "" }, en)).toBe("English B");
    expect(resolveMessage("a.b", { "a.b": "   " }, en)).toBe("English B");
  });

  it("returns the key when neither catalog has it", () => {
    // Visibly unfinished beats plausibly blank when a screen is under review.
    expect(resolveMessage("a.missing", {}, en)).toBe("a.missing");
  });

  it("survives an absent active catalog", () => {
    expect(resolveMessage("a.b", undefined, en)).toBe("English B");
  });
});

describe("translate", () => {
  it("resolves then interpolates", () => {
    expect(
      translate("x", { x: "{{actor}} ne banaya" }, { x: "{{actor}} made it" }, { actor: "Ramesh" })
    ).toBe("Ramesh ne banaya");
  });

  it("interpolates the English fallback too", () => {
    expect(translate("x", {}, { x: "{{actor}} made it" }, { actor: "Ramesh" })).toBe(
      "Ramesh made it"
    );
  });
});

describe("pluralSuffix", () => {
  it("selects the singular at one in every language", () => {
    for (const language of ["en", "hi", "te", "ta", "kn", "ml"] as const) {
      expect(pluralSuffix(language, 1)).toBe("_one");
    }
  });

  it("puts zero in the singular for Hindi only", () => {
    // CLDR r45: hi is `i = 0 or n = 1`; the other five are `n = 1`.
    expect(pluralSuffix("hi", 0)).toBe("_one");
    for (const language of ["en", "te", "ta", "kn", "ml"] as const) {
      expect(pluralSuffix(language, 0)).toBe("_other");
    }
  });

  it("selects the plural above one everywhere", () => {
    for (const language of ["en", "hi", "te", "ta", "kn", "ml"] as const) {
      expect(pluralSuffix(language, 2)).toBe("_other");
      expect(pluralSuffix(language, 47)).toBe("_other");
    }
  });

  it("ignores the sign, so a negative balance still reads grammatically", () => {
    expect(pluralSuffix("en", -1)).toBe("_one");
    expect(pluralSuffix("en", -5)).toBe("_other");
  });
});

describe("translatePlural", () => {
  const en = {
    "m.count_one": "{{count}} member",
    "m.count_other": "{{count}} members",
  };

  it("picks the form and injects count without the caller passing it", () => {
    expect(translatePlural("m.count", 1, "en", undefined, en)).toBe("1 member");
    expect(translatePlural("m.count", 4, "en", undefined, en)).toBe("4 members");
  });

  it("applies the Hindi zero rule", () => {
    const hi = { "m.count_one": "{{count}} सदस्य", "m.count_other": "{{count}} सदस्य" };
    expect(translatePlural("m.count", 0, "hi", hi, en)).toBe("0 सदस्य");
    expect(translatePlural("m.count", 0, "en", undefined, en)).toBe("0 members");
  });
});
