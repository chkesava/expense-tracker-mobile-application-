import { describe, expect, it } from "vitest";

import { en } from "./en";
import { hi } from "./hi";
import { kn } from "./kn";
import { ml } from "./ml";
import { placeholdersIn } from "./runtime";
import { ta } from "./ta";
import { te } from "./te";
import { GANESH_LANGUAGES, GANESH_LANGUAGE_META, type GaneshLanguage } from "./types";

const CATALOGS: Record<GaneshLanguage, Record<string, string>> = { en, hi, te, ta, kn, ml };

const TRANSLATED = GANESH_LANGUAGES.filter((code) => code !== "en");

/**
 * Keys whose value is legitimately the same in every language — proper nouns
 * and symbols. Everything else matching English exactly means the generator
 * echoed the source instead of translating it.
 */
const INTENTIONALLY_IDENTICAL = new Set<string>([]);

describe("Ganesh catalogs", () => {
  it("ships a catalog for every declared language", () => {
    for (const code of GANESH_LANGUAGES) {
      expect(CATALOGS[code], `no catalog for ${code}`).toBeDefined();
    }
  });

  it("declares metadata for every language, and nothing extra", () => {
    expect(Object.keys(GANESH_LANGUAGE_META).sort()).toEqual([...GANESH_LANGUAGES].sort());
  });

  it("names each language in its own script", () => {
    // An admin who does not read Telugu must still be able to pick Telugu, and
    // a member must recognise their own language in the list.
    for (const code of GANESH_LANGUAGES) {
      const meta = GANESH_LANGUAGE_META[code];
      expect(meta.nativeLabel.trim().length, code).toBeGreaterThan(0);
      expect(meta.englishLabel.trim().length, code).toBeGreaterThan(0);
    }
    expect(GANESH_LANGUAGE_META.te.nativeLabel).not.toBe(GANESH_LANGUAGE_META.te.englishLabel);
  });

  it.each(TRANSLATED)("%s has exactly the English key set", (code) => {
    expect(Object.keys(CATALOGS[code]).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(GANESH_LANGUAGES)("%s has no blank values", (code) => {
    const blank = Object.entries(CATALOGS[code])
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it.each(TRANSLATED)("%s keeps the same placeholders as English for every key", (code) => {
    // The highest-value assertion here. A translation that drops {{target}}
    // renders a sentence naming nobody, which reads as correct and is not.
    const mismatched: string[] = [];
    for (const [key, english] of Object.entries(en)) {
      const expected = [...placeholdersIn(english)].sort();
      const actual = [...placeholdersIn(CATALOGS[code][key] ?? "")].sort();
      if (expected.join(",") !== actual.join(",")) {
        mismatched.push(`${key}: expected {${expected.join(",")}} got {${actual.join(",")}}`);
      }
    }
    expect(mismatched).toEqual([]);
  });

  it.each(TRANSLATED)("%s does not simply echo the English string", (code) => {
    const echoed = Object.entries(en)
      .filter(([key, english]) => !INTENTIONALLY_IDENTICAL.has(key))
      .filter(([key, english]) => CATALOGS[code][key] === english)
      .map(([key]) => key);
    expect(echoed).toEqual([]);
  });

  it.each(GANESH_LANGUAGES)("%s has no malformed placeholder syntax", (code) => {
    const malformed = Object.entries(CATALOGS[code])
      .filter(([, value]) => {
        // Remove the well-formed tokens, then any brace still standing is a
        // typo: a single `{name}`, an unclosed `{{name}`, or a stray `}`.
        const residue = value.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "");
        return value.includes("${") || residue.includes("{") || residue.includes("}");
      })
      .map(([key]) => key);
    expect(malformed).toEqual([]);
  });

  it("pairs every plural key with its counterpart in every language", () => {
    for (const code of GANESH_LANGUAGES) {
      const keys = Object.keys(CATALOGS[code]);
      for (const key of keys) {
        if (key.endsWith("_one")) {
          expect(keys, `${code}: ${key} has no _other`).toContain(
            `${key.slice(0, -"_one".length)}_other`
          );
        }
        if (key.endsWith("_other")) {
          expect(keys, `${code}: ${key} has no _one`).toContain(
            `${key.slice(0, -"_other".length)}_one`
          );
        }
      }
    }
  });

  it("interpolates count into every plural form", () => {
    for (const code of GANESH_LANGUAGES) {
      for (const [key, value] of Object.entries(CATALOGS[code])) {
        if (key.endsWith("_one") || key.endsWith("_other")) {
          expect(placeholdersIn(value), `${code}: ${key}`).toContain("count");
        }
      }
    }
  });

  it("prefixes every key with its own namespace", () => {
    // Namespaces are spread into one object, so a key filed under the wrong
    // prefix could silently shadow another namespace's key.
    const namespaces = ["common", "language", "nav"];
    const stray = Object.keys(en).filter(
      (key) => !namespaces.some((ns) => key.startsWith(`${ns}.`))
    );
    expect(stray).toEqual([]);
  });
});
