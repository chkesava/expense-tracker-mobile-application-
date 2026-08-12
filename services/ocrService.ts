import { suggestCategoryFromNote } from "@/shared/data/categoryTaxonomy";
import { todayDateKey } from "@/shared/utils/dates";

export interface ExtractedReceiptData {
  merchant?: string;
  total?: number;
  date?: string; // YYYY-MM-DD
  tax?: number;
  items?: string[];
  suggestedCategory?: string;
  suggestedSubcategory?: string;
  confidence: number;
}

/**
 * Parses raw OCR text into structured receipt fields.
 */
export function parseReceiptOcrText(rawText: string): ExtractedReceiptData {
  const text = (rawText || "").trim();
  if (!text) {
    return { confidence: 0 };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let merchant: string | undefined = undefined;
  let total: number | undefined = undefined;
  let date: string | undefined = undefined;
  let tax: number | undefined = undefined;
  const items: string[] = [];
  let confidence = 0.3;

  // 1. Merchant candidate: usually first non-empty line
  if (lines.length > 0) {
    const candidate = lines[0].replace(/[^a-zA-Z0-9\s&'-]/g, "").trim();
    if (candidate.length > 2 && !/total|invoice|receipt|tax|date/i.test(candidate)) {
      merchant = candidate;
      confidence += 0.2;
    }
  }

  // 2. Total extraction
  const totalKeywords = /(?:total|amount due|grand total|net amount|balance due|final total|paid|inr|rs\.?|₹|\$)\s*[:=]?\s*(?:rs\.?|₹|\$)?\s*(\d+(?:\.\d{1,2})?)/i;
  for (const line of [...lines].reverse()) {
    const match = line.match(totalKeywords);
    if (match) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val > 0) {
        total = val;
        confidence += 0.3;
        break;
      }
    }
  }

  // If total not found by keyword, look for the largest standalone number in the bottom half
  if (!total && lines.length > 1) {
    const bottomLines = lines.slice(Math.floor(lines.length / 2));
    let maxFound = 0;
    for (const line of bottomLines) {
      const numMatch = line.match(/(?:rs\.?|₹|\$)?\s*(\d{2,6}(?:\.\d{1,2})?)/i);
      if (numMatch) {
        const n = parseFloat(numMatch[1]);
        if (!isNaN(n) && n > maxFound) {
          maxFound = n;
        }
      }
    }
    if (maxFound > 0) {
      total = maxFound;
      confidence += 0.15;
    }
  }

  // 3. Date extraction (YYYY-MM-DD preferred; numeric forms interpret day-first / DD-MM for INR)
  const datePatterns = [
    /\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/,
    /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})\b/,
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
  ];

  for (const line of lines) {
    for (const pat of datePatterns) {
      const dMatch = line.match(pat);
      if (dMatch) {
        if (dMatch[3] && dMatch[3].length === 4) {
          // Numeric DD/MM/YYYY (India default). If first > 12 it must be day.
          const first = Number(dMatch[1]);
          const second = Number(dMatch[2]);
          const y = dMatch[3];
          const dayFirst = first > 12 || second <= 12;
          const d = String(dayFirst ? first : second).padStart(2, "0");
          const m = String(dayFirst ? second : first).padStart(2, "0");
          if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
            date = `${y}-${m}-${d}`;
          }
        } else if (dMatch[1].length === 4) {
          // YYYY-MM-DD
          date = `${dMatch[1]}-${String(dMatch[2]).padStart(2, "0")}-${String(dMatch[3]).padStart(2, "0")}`;
        }
        if (date) {
          confidence += 0.15;
          break;
        }
      }
    }
    if (date) break;
  }

  if (!date) {
    date = todayDateKey();
  }

  // 4. Tax extraction
  const taxMatch = text.match(/(?:tax|gst|vat|cgst|sgst)\s*[:=]?\s*(?:rs\.?|₹|\$)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (taxMatch) {
    tax = parseFloat(taxMatch[1]);
  }

  // 5. Suggest Category from Merchant & text
  const categoryHint = suggestCategoryFromNote(merchant ? `${merchant} ${text}` : text);

  return {
    merchant,
    total,
    date,
    tax,
    items,
    suggestedCategory: categoryHint?.category || "Shopping",
    suggestedSubcategory: categoryHint?.subcategory || "General Shopping",
    confidence: Math.min(1.0, Math.round(confidence * 100) / 100),
  };
}
