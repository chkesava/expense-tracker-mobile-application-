import {
  CATEGORY_TAXONOMY,
  suggestCategoryFromNote,
} from "@/shared/data/categoryTaxonomy";
import type { CategorizationRule } from "@/shared/types/expense";

export interface ParsedTransaction {
  type: "expense" | "income";
  amount?: number;
  date?: string; // YYYY-MM-DD
  category?: string;
  subcategory?: string;
  accountId?: string;
  accountName?: string;
  note?: string;
  confidence: number;
}

export interface ParseOptions {
  accounts?: Array<{ id: string; name: string }>;
  rules?: CategorizationRule[];
  defaultCurrency?: string;
}

/**
 * Format a Date object to YYYY-MM-DD
 */
function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse natural language text into a structured transaction.
 * Handles patterns like:
 * - "Spent 450 on groceries yesterday with HDFC"
 * - "Paid 1200 for electricity bill"
 * - "5k salary received today in SBI"
 * - "Coffee 150 rs"
 * - "Dinner with friends 2400 last friday cash"
 */
export function parseNaturalLanguageTransaction(
  input: string,
  options: ParseOptions = {}
): ParsedTransaction {
  const text = (input || "").trim();
  if (!text) {
    return {
      type: "expense",
      confidence: 0,
    };
  }

  let remaining = text;
  let type: "expense" | "income" = "expense";
  let amount: number | undefined = undefined;
  let date: string | undefined = undefined;
  let category: string | undefined = undefined;
  let subcategory: string | undefined = undefined;
  let accountId: string | undefined = undefined;
  let accountName: string | undefined = undefined;
  let confidence = 0.4;

  // 1. Detect Type (Expense vs Income)
  const incomeKeywords = [
    /\bsalary\b/i,
    /\breceived\b/i,
    /\bincome\b/i,
    /\bcredited\b/i,
    /\bearned\b/i,
    /\bdividend\b/i,
    /\bcashback\b/i,
    /\brefund\b/i,
  ];
  if (incomeKeywords.some((regex) => regex.test(text))) {
    type = "income";
    category = "Salary";
  }

  // 2. Extract Amount
  // Matches: ₹500, Rs. 500, $500, 500rs, 5.5k, 5k, 500.50, 500
  const amountRegexes = [
    /(?:(?:rs\.?|₹|\$|inr|eur|gbp)\s*)(\d+(?:\.\d+)?)\s*(k|lakh|lac)?\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:k|lakh|lac)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:rs\.?|₹|\$|inr|bucks)\b/i,
    /\b(\d{1,7}(?:\.\d{1,2})?)\b/,
  ];

  for (const regex of amountRegexes) {
    const match = text.match(regex);
    if (match) {
      let rawVal = parseFloat(match[1]);
      const suffix = (match[2] || "").toLowerCase();

      if (suffix === "k") {
        rawVal *= 1000;
      } else if (suffix === "lakh" || suffix === "lac") {
        rawVal *= 100000;
      } else if (match[0].toLowerCase().endsWith("k")) {
        rawVal *= 1000;
      }

      if (!isNaN(rawVal) && rawVal > 0) {
        amount = rawVal;
        confidence += 0.25;
        // Strip amount token from remaining text
        remaining = remaining.replace(match[0], " ");
        break;
      }
    }
  }

  // 3. Extract Date Relative / Absolute
  const now = new Date();
  const dateMap: Array<{ pattern: RegExp; getOffset: () => Date }> = [
    {
      pattern: /\btoday\b/i,
      getOffset: () => new Date(now),
    },
    {
      pattern: /\byesterday\b/i,
      getOffset: () => {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        return d;
      },
    },
    {
      pattern: /\bday before yesterday\b/i,
      getOffset: () => {
        const d = new Date(now);
        d.setDate(d.getDate() - 2);
        return d;
      },
    },
    {
      pattern: /\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      getOffset: () => {
        const targetDayStr = text.match(/\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1]?.toLowerCase();
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const targetIdx = days.indexOf(targetDayStr || "");
        const d = new Date(now);
        if (targetIdx !== -1) {
          const currIdx = d.getDay();
          let diff = currIdx - targetIdx;
          if (diff <= 0) diff += 7;
          d.setDate(d.getDate() - diff);
        }
        return d;
      },
    },
  ];

  for (const { pattern, getOffset } of dateMap) {
    if (pattern.test(text)) {
      date = formatDateKey(getOffset());
      remaining = remaining.replace(pattern, " ");
      break;
    }
  }

  // Check for ISO or YYYY-MM-DD or DD/MM/YYYY
  if (!date) {
    const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (isoMatch) {
      date = isoMatch[0];
      remaining = remaining.replace(isoMatch[0], " ");
    } else {
      const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
      if (slashMatch) {
        const d = String(slashMatch[1]).padStart(2, "0");
        const m = String(slashMatch[2]).padStart(2, "0");
        const y = slashMatch[3];
        date = `${y}-${m}-${d}`;
        remaining = remaining.replace(slashMatch[0], " ");
      }
    }
  }

  if (!date) {
    date = formatDateKey(now);
  }

  // 4. Extract Account Matching
  if (options.accounts && options.accounts.length > 0) {
    for (const acc of options.accounts) {
      const accRegex = new RegExp(`\\b(?:in|with|via|from|to|by|using)?\\s*(${acc.name})\\b`, "i");
      if (accRegex.test(remaining)) {
        accountId = acc.id;
        accountName = acc.name;
        confidence += 0.15;
        remaining = remaining.replace(accRegex, " ");
        break;
      }
    }
  }

  // 5. Extract Category from Categorization Rules or Taxonomy
  if (type === "expense") {
    // Try user rules first
    if (options.rules && options.rules.length > 0) {
      const matchedRule = options.rules.find((r) =>
        text.toLowerCase().includes(r.keyword.toLowerCase())
      );
      if (matchedRule) {
        category = matchedRule.category;
        subcategory = matchedRule.subcategory;
        confidence += 0.2;
      }
    }

    // Try taxonomy suggestion if not resolved
    if (!category) {
      const taxonomySuggestion = suggestCategoryFromNote(text);
      if (taxonomySuggestion) {
        category = taxonomySuggestion.category;
        subcategory = taxonomySuggestion.subcategory;
        confidence += 0.15;
      }
    }

    // Default fallback
    if (!category) {
      category = "Other";
      subcategory = "General";
    }
  }

  // 6. Clean Note
  // Strip common prepositions / trigger words
  let cleanNote = remaining
    .replace(/\b(spent|paid|bought|for|on|at|in|with|via|from|to|by|using|rs|inr|dollars|today|yesterday|last|received|credited|earned|salary|income)\b/gi, " ")
    .replace(/[₹\$#@!%^&*()_+=\[\]{};':"\\|,.<>\/?~`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // If clean note became empty, use original category or fallback
  if (!cleanNote) {
    cleanNote = subcategory || category || "Transaction";
  } else {
    // Capitalize first letter
    cleanNote = cleanNote.charAt(0).toUpperCase() + cleanNote.slice(1);
  }

  return {
    type,
    amount,
    date,
    category,
    subcategory,
    accountId,
    accountName,
    note: cleanNote,
    confidence: Math.min(1.0, Math.round(confidence * 100) / 100),
  };
}
