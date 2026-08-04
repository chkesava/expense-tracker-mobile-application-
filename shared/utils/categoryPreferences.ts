import { getSharedStorage } from "../storage/memoryStorage";

const RECENT_KEY = "recentCategoryPairs";
const MAX_RECENT = 8;

export type RecentCategoryPair = {
  category: string;
  subcategory: string;
  at: number;
};

export function getRecentCategoryPairs(): RecentCategoryPair[] {
  try {
    const raw = getSharedStorage().getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentCategoryPair[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function pushRecentCategoryPair(category: string, subcategory: string) {
  if (!category) return;
  const next: RecentCategoryPair = {
    category,
    subcategory: subcategory || "Other",
    at: Date.now(),
  };
  const prev = getRecentCategoryPairs().filter(
    (p) => !(p.category === next.category && p.subcategory === next.subcategory)
  );
  getSharedStorage().setItem(
    RECENT_KEY,
    JSON.stringify([next, ...prev].slice(0, MAX_RECENT))
  );
}

export const CATEGORY_COLOR_PRESETS = [
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
  "#0f172a",
] as const;

export const CATEGORY_ICON_PRESETS = [
  "🏠", "🍽", "💪", "🚗", "🩺", "👨‍👩‍👧", "💻", "💳", "📈", "🛒",
  "🎬", "📚", "💼", "🧾", "🎁", "🐶", "✈", "💰", "📦", "⭐",
] as const;
