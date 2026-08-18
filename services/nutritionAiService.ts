import { env } from "@/lib/env";
import { logError } from "@/lib/errors";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { FoodItem, NutrientTotals } from "@/shared/types/nutrition";

export type AnalyzedFood = Omit<FoodItem, "id">;

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

function emptyNutrients(): NutrientTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

function normalizeFood(raw: Partial<AnalyzedFood>): AnalyzedFood | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const nutrients = raw.nutrients ?? emptyNutrients();
  return {
    name,
    quantity: typeof raw.quantity === "string" && raw.quantity.trim()
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

/**
 * Estimate nutrients from a natural-language food description via Gemini.
 * Same contract as the web `analyzeNutrition` helper.
 */
export async function analyzeNutrition(text: string): Promise<AnalyzedFood[]> {
  const apiKey = env.geminiApiKey;
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env."
    );
  }

  const prompt = `
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

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      timeoutMs: 25000,
    });

    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status})`);
    }

    const payload = (await response.json()) as GeminiGenerateResponse;
    const rawText =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .replace(/```json|```/g, "")
        .trim() ?? "";

    const parsed = JSON.parse(rawText) as { foods?: Partial<AnalyzedFood>[] };
    const foods = Array.isArray(parsed.foods)
      ? parsed.foods.map(normalizeFood).filter((item): item is AnalyzedFood => item != null)
      : [];

    if (foods.length === 0) {
      throw new Error("AI couldn't understand that food.");
    }
    return foods;
  } catch (error) {
    logError("nutrition.ai.analyze", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to parse nutrition data from text.");
  }
}
