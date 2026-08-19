export const ACCOUNT_GREEN = "#4ADE80";
export const ACCOUNT_GREEN_DIM = "rgba(74, 222, 128, 0.16)";
export const ACCOUNT_GREEN_BORDER = "rgba(74, 222, 128, 0.45)";
export const ACCOUNT_GREEN_GLOW = "rgba(74, 222, 128, 0.22)";
export const ACCOUNT_RED = "#F87171";
export const ACCOUNT_RED_DIM = "rgba(239, 68, 68, 0.16)";
export const CARD_ORANGE = "#FBBF24";
export const CARD_INDIGO_BORDER = "rgba(251, 191, 36, 0.55)";
export const CARD_PURPLE = "#6D5AE6";
export const CARD_PURPLE_DARK = "#4338CA";
export const INCOME_BADGE_BG = "rgba(139, 92, 246, 0.22)";
export const INCOME_BADGE_FG = "#C4B5FD";
export const EXPENSE_BADGE_BG = "rgba(239, 68, 68, 0.18)";
export const EXPENSE_BADGE_FG = "#FCA5A5";

export function accountAccent(isDark: boolean): string {
  return isDark ? ACCOUNT_GREEN : "#16A34A";
}

export function accountAccentBorder(isDark: boolean): string {
  return isDark ? ACCOUNT_GREEN_BORDER : "rgba(22, 163, 74, 0.45)";
}

/** Darken a hex accent for gradient endpoints. Falls back to indigo. */
export function shadeCardAccent(hex: string): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;
  if (full.length !== 6 || Number.isNaN(Number.parseInt(full, 16))) {
    return CARD_PURPLE_DARK;
  }
  const value = Number.parseInt(full, 16);
  const r = Math.max(0, ((value >> 16) & 255) - 36);
  const g = Math.max(0, ((value >> 8) & 255) - 42);
  const b = Math.max(0, (value & 255) - 18);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
