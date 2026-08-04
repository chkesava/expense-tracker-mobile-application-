import { suggestCategoryFromNote } from "../data/categoryTaxonomy";
import { toLocalDateKey } from "./dates";

export interface ParsedExpense {
  amount: number | null;
  date: string;
  note: string;
  category: string;
  subcategory?: string;
  confidence: number;
}

const STOP_WORDS = ["a", "an", "the", "is", "of", "for", "at", "on", "to", "with", "from", "paid", "gave", "spent", "buy", "bought"];

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

export function parseMagicEntry(text: string): ParsedExpense {
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/);
  
  let amount: number | null = null;
  const amountPatterns = [
    /(?:rs|₹|\$|bucks)?\s?(\d+(?:\.\d+)?)\s?(k|grand|bucks|rs|₹|\$)?/i,
    /(\d+(?:\.\d+)?)\s?(?:k|grand|bucks|rs|₹|\$)/i
  ];

  for (const pattern of amountPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      let val = parseFloat(match[1]);
      const suffix = (match[2] || "").toLowerCase();
      if (suffix === "k") val *= 1000;
      if (suffix === "grand") val *= 1000;
      
      if (!amount || (val > amount && val < 1000000 && (val < 1900 || val > 2100))) {
        amount = val;
      }
    }
  }

  let date = new Date();
  let dateFound = false;

  if (normalized.includes("yesterday") || normalized.includes("last night")) {
    date.setDate(date.getDate() - 1);
    dateFound = true;
  } else if (normalized.includes("day before")) {
    date.setDate(date.getDate() - 2);
    dateFound = true;
  }
  
  const agoMatch = normalized.match(/(\d+)\s+days?\s+ago/);
  if (agoMatch) {
    date.setDate(date.getDate() - parseInt(agoMatch[1]));
    dateFound = true;
  }

  const lastDayMatch = normalized.match(/last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)/);
  if (lastDayMatch) {
    const targetDay = DAY_MAP[lastDayMatch[1]];
    const currentDay = date.getDay();
    let diff = currentDay - targetDay;
    if (diff <= 0) diff += 7;
    date.setDate(date.getDate() - diff);
    dateFound = true;
  }

  const specificDateMatch = normalized.match(/(?:on\s+)?(\d+)(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/);
  if (specificDateMatch) {
    const day = parseInt(specificDateMatch[1]);
    const month = MONTH_MAP[specificDateMatch[2]];
    date.setMonth(month);
    date.setDate(day);
    dateFound = true;
  }

  const formattedDate = toLocalDateKey(date);

  const suggestion = suggestCategoryFromNote(text);
  const category = suggestion?.category ?? "Miscellaneous";
  const subcategory = suggestion?.subcategory ?? "Other";
  const maxScore = suggestion ? 4 : 0;

  const noteParts = words.filter(word => {
    const amountStr = amount?.toString();
    if (amountStr && (word.includes(amountStr) || ["k", "grand", "bucks", "rs", "₹", "$"].includes(word.toLowerCase()))) return false;
    if (dateFound && ["today", "yesterday", "last", "night", "ago", "days", "day", ...Object.keys(DAY_MAP), ...Object.keys(MONTH_MAP)].includes(word.toLowerCase())) return false;
    if (STOP_WORDS.includes(word.toLowerCase())) return false;
    return true;
  });

  let note = noteParts.join(" ").trim();
  note = note.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
  if (note) {
    note = note.charAt(0).toUpperCase() + note.slice(1);
  }

  return {
    amount,
    date: formattedDate,
    note: note || "No description",
    category,
    subcategory,
    confidence: maxScore > 0 ? Math.min(maxScore / 5, 1) : 0.5
  };
}

export function parseMagicBatch(text: string): ParsedExpense[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const results: ParsedExpense[] = [];
  
  for (const line of lines) {
    const parsed = parseMagicEntry(line);
    if (parsed.amount !== null) {
      results.push(parsed);
    }
  }

  if (results.length === 0 && text.toLowerCase().includes(" and ") && text.length < 200) {
    const parts = text.split(/\s+and\s+/i);
    for (const part of parts) {
      const parsed = parseMagicEntry(part);
      if (parsed.amount !== null) {
        results.push(parsed);
      }
    }
  }

  return results;
}
