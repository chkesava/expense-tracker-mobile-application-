import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  buildNutritionPrompt,
  NUTRITION_AI_MAX_TEXT,
  nutritionAiFunctionUrl,
  parseNutritionAiResponse,
  sanitizeNutritionText,
} from "./nutritionAi";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("nutritionAiFunctionUrl", () => {
  it("points at the Netlify function on the share host", () => {
    expect(nutritionAiFunctionUrl("https://spendly-share.netlify.app")).toBe(
      "https://spendly-share.netlify.app/.netlify/functions/nutrition-ai"
    );
  });

  it("is empty when origin is missing so the client cannot guess a host", () => {
    expect(nutritionAiFunctionUrl("")).toBe("");
  });
});

describe("sanitizeNutritionText", () => {
  it("trims and caps length", () => {
    expect(sanitizeNutritionText("  idli  ")).toBe("idli");
    expect(sanitizeNutritionText("x".repeat(NUTRITION_AI_MAX_TEXT + 20))).toHaveLength(
      NUTRITION_AI_MAX_TEXT
    );
  });

  it("rejects non-strings", () => {
    expect(sanitizeNutritionText(null)).toBe("");
    expect(sanitizeNutritionText({ text: "idli" })).toBe("");
  });
});

describe("parseNutritionAiResponse", () => {
  it("reads a markdown-wrapped JSON payload", () => {
    const foods = parseNutritionAiResponse(
      '```json\n{"foods":[{"name":"Idli","quantity":"2","nutrients":{"calories":80,"protein":2,"carbs":15,"fat":0.5,"fiber":1}}]}\n```'
    );
    expect(foods).toEqual([
      {
        name: "Idli",
        quantity: "2",
        nutrients: { calories: 80, protein: 2, carbs: 15, fat: 0.5, fiber: 1 },
      },
    ]);
  });

  it("drops nameless rows", () => {
    expect(parseNutritionAiResponse('{"foods":[{"name":"  "}]}')).toEqual([]);
  });
});

describe("buildNutritionPrompt", () => {
  it("does not let a quote close the user-input string", () => {
    expect(buildNutritionPrompt('idli "sambar"')).toContain("idli 'sambar'");
    expect(buildNutritionPrompt('idli "sambar"')).not.toContain('idli "sambar"');
  });
});

describe("SPENDLY-24 client secret hygiene", () => {
  it("does not inline a Gemini key through lib/env.ts", () => {
    expect(read("lib/env.ts")).not.toMatch(/GEMINI/);
  });

  it("does not call Google from the device", () => {
    expect(read("services/nutritionAiService.ts")).not.toContain(
      "generativelanguage.googleapis.com"
    );
    expect(read("services/nutritionAiService.ts")).not.toMatch(/GEMINI_API_KEY/);
  });

  it("bundles the proxy with the other Netlify functions", () => {
    expect(read("scripts/bundle-netlify-fns.js")).toContain("nutrition-ai");
  });
});
