import { logError } from "@/lib/errors";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";
import {
  nutritionAiFunctionUrl,
  sanitizeNutritionText,
  type AnalyzedFood,
} from "@/shared/utils/nutritionAi";

export type { AnalyzedFood };

/**
 * Estimate nutrients from a natural-language food description.
 *
 * SPENDLY-24: the Gemini key stays on the Netlify function. This client only
 * sends the food text plus a Firebase ID token.
 */
export async function analyzeNutrition(text: string): Promise<AnalyzedFood[]> {
  const cleaned = sanitizeNutritionText(text);
  if (!cleaned) {
    throw new Error("Describe the food in plain text.");
  }

  const url = nutritionAiFunctionUrl(getPublicAppOrigin());
  if (!url) {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }

  const [{ getFirebaseAuth }] = await Promise.all([import("@/lib/firebase")]);
  const idToken = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in first.");

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: cleaned }),
      timeoutMs: 25000,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      foods?: AnalyzedFood[];
    };
    if (!response.ok) {
      throw new Error(payload.error || "Failed to analyze food");
    }
    if (!Array.isArray(payload.foods) || payload.foods.length === 0) {
      throw new Error("AI couldn't understand that food.");
    }
    return payload.foods;
  } catch (error) {
    logError("nutrition.ai.analyze", error);
    throw error instanceof Error
      ? error
      : new Error("Failed to parse nutrition data from text.");
  }
}
