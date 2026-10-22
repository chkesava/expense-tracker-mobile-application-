/**
 * SPENDLY-570 — a merchant "logo" tile without licensed artwork: the
 * merchant's initials on a colour picked deterministically from its id. Only
 * a merchant the resolver is sure of (or the user named) gets a tile; a
 * low-confidence guess or an unknown keeps the category glyph, so a row never
 * claims a merchant it isn't sure of.
 */

import type { MerchantResolution } from "../types/merchant";

/** Number of tile colours the UI defines (`MONOGRAM_COLORS`). */
export const MONOGRAM_PALETTE_SIZE = 8;

export type MerchantMonogram = {
  merchantId: string;
  /** One or two letters, upper-case. */
  initials: string;
  /** Index into the UI palette, stable per merchant. */
  colorIndex: number;
};

const SURE_METHODS = new Set<MerchantResolution["method"]>(["user_override", "user_alias"]);

/** 32-bit FNV-1a: stable across platforms and sessions. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** "Amazon Pay" → "AP", "zomato" → "Z", "7-Eleven" → "7E"; null when nothing usable. */
export function monogramInitials(name: string): string | null {
  const words = name
    .split(/[\s\-_.&/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return null;
  const letters = words.slice(0, 2).map((w) => [...w][0]);
  return letters.join("").toUpperCase();
}

export function merchantMonogram(resolution: MerchantResolution | null | undefined): MerchantMonogram | null {
  if (!resolution?.merchantId) return null;
  const sure =
    SURE_METHODS.has(resolution.method) || resolution.confidence === "high" || resolution.confidence === "medium";
  if (!sure) return null;
  const initials = monogramInitials(resolution.displayName);
  if (!initials) return null;
  return {
    merchantId: resolution.merchantId,
    initials,
    colorIndex: hash(resolution.merchantId) % MONOGRAM_PALETTE_SIZE,
  };
}
