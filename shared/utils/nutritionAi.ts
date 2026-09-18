/**
 * Nutrition food-analysis contract (SPENDLY-24).
 *
 * Gemini is a spendable credential. The client never sees the key: it POSTs
 * `{ text }` to this function with a Firebase ID token, and the Netlify
 * function calls Google. Prompt construction and response parsing live here so
 * `npm test` can prove them without hitting Gemini or Netlify.
 */

import type { FoodItem, NutrientTotals } from "@/shared/types/nutrition";

export type AnalyzedFood = Omit<FoodItem, "id">;

export const NUTRITION_AI_MAX_TEXT = 500;
export const NUTRITION_AI_MODEL = "gemini-2.5-flash";

export function nutritionAiFunctionUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return base ? `${base}/.netlify/functions/nutrition-ai` : "";
}

export function sanitizeNutritionText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.trim().slice(0, NUTRITION_AI_MAX_TEXT);
}

function emptyNutrients(): NutrientTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

export function normalizeAnalyzedFood(raw: Partial<AnalyzedFood>): AnalyzedFood | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const nutrients = raw.nutrients ?? emptyNutrients();
  return {
    name,
    quantity:
      typeof raw.quantity === "string" && raw.quantity.trim()
        ? raw.quantity.trim()
        : "1 serving",
    nutrients: {
      calories: Number(nutrients.calories) || 0,
      protein: Number(nutrients.protein) || 0,
      carbs: Number(nutrients.carbs) || 0,
      fat: Number(nutrients.fat) || 0,
      fiber: Number(nutrients.fiber) || 0,
    },
  };
}

export function buildNutritionPrompt(text: string): string {
  return `
    Analyze the following food description and estimate the nutritional breakdown.
    Return ONLY a valid JSON object with the following structure:
    {
      "foods": [
        {
          "name": "string (name of the food item)",
          "quantity": "string (e.g. 1 slice, 200g)",
          "nutrients": {
            "calories": number (estimated total calories),
            "protein": number (estimated protein in grams),
            "carbs": number (estimated carbs in grams),
            "fat": number (estimated fat in grams),
            "fiber": number (estimated fiber in grams, default to 0 if unknown)
          }
        }
      ]
    }

    User Input: "${text.replace(/"/g, "'")}"

    Rules:
    1. Break down the input into individual distinct food items if there are multiple.
    2. Estimate the nutritional values as accurately as possible based on standard portion sizes if not specified.
    3. Return ONLY the JSON object, absolutely no markdown formatting, no backticks, no explanations.
  `;
}

export function parseNutritionAiResponse(rawText: string): AnalyzedFood[] {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  if (!cleaned) return [];
  const parsed = JSON.parse(cleaned) as { foods?: Partial<AnalyzedFood>[] };
  if (!Array.isArray(parsed.foods)) return [];
  return parsed.foods
    .map(normalizeAnalyzedFood)
    .filter((item): item is AnalyzedFood => item != null);
}
