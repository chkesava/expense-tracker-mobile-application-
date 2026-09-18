import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  buildNutritionPrompt,
  NUTRITION_AI_MODEL,
  parseNutritionAiResponse,
  sanitizeNutritionText,
} from "../../shared/utils/nutritionAi";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode: number, payload: Record<string, unknown>): NetlifyResult {
  return {
    statusCode,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function header(event: NetlifyEvent, name: string): string {
  const headers = event.headers ?? {};
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? String(headers[match] ?? "") : "";
}

function initAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ?? "";
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on this Netlify site.");
  }
  const creds = JSON.parse(raw) as { project_id?: string; projectId?: string };
  initializeApp({
    credential: cert(creds as Parameters<typeof cert>[0]),
    projectId: creds.project_id ?? creds.projectId,
  });
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Spendly AUTH-01 / SPENDLY-24. The Gemini key used to ship in every product
 * bundle via `EXPO_PUBLIC_GEMINI_API_KEY`. This function is the only caller.
 */
export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST." });
  }

  try {
    initAdmin();
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Admin SDK failed to start.",
    });
  }

  const authHeader = header(event, "authorization");
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return json(401, { error: "Sign in first." });

  try {
    await getAuth().verifyIdToken(token);
  } catch {
    return json(401, { error: "Sign in first." });
  }

  let body: { text?: unknown } = {};
  try {
    body = event.body ? (JSON.parse(event.body) as typeof body) : {};
  } catch {
    return json(400, { error: "Describe the food in plain text." });
  }

  const text = sanitizeNutritionText(body.text);
  if (!text) return json(400, { error: "Describe the food in plain text." });

  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    return json(500, { error: "Nutrition analysis is not configured." });
  }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/${NUTRITION_AI_MODEL}:generateContent`;
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildNutritionPrompt(text) }] }],
      }),
    });
  } catch {
    return json(502, { error: "Could not reach nutrition analysis." });
  }

  if (!geminiResponse.ok) {
    return json(502, { error: "Nutrition analysis failed. Try again." });
  }

  try {
    const payload = (await geminiResponse.json()) as GeminiGenerateResponse;
    const rawText =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") ?? "";
    const foods = parseNutritionAiResponse(rawText);
    if (foods.length === 0) {
      return json(422, { error: "AI couldn't understand that food." });
    }
    return json(200, { foods });
  } catch {
    return json(502, { error: "Nutrition analysis failed. Try again." });
  }
}
