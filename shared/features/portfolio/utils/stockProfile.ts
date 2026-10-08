/**
 * Stock Profile identity/dedup (SPENDLY-420).
 *
 * The profile id is derived from the instrument's identity, not minted
 * randomly: "find or create a profile for this instrument" then becomes a
 * plain `setDoc({merge: true})` to a known path — no query, no race, safe
 * offline and under retry, the same reasoning `shared/utils/cashbackId.ts`
 * uses for cashback records. Two different instruments essentially never
 * collide (64 bits of FNV-1a); two writes of the *same* instrument always
 * resolve to the same doc and just re-merge identical identity fields.
 *
 * Pure and Firestore-free so vitest can cover it directly.
 */

import type { Exchange, InstrumentType } from "@/shared/features/portfolio/types";

export type StockProfileIdentity = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: Exchange;
  instrumentType: InstrumentType;
  isin?: string;
  currency?: string;
  sector?: string;
  logoUrl?: string;
};

/**
 * One instrument, one key: ISIN when known, else yahooSymbol, else
 * exchange+symbol. Mirrors `holdingMatchKey` in `holdingsOverwrite.ts` (which
 * predates ISIN support) — kept as a separate function because CSV rows and
 * manual entry rarely carry an ISIN, so the fallback chain matters more here
 * than the exact shape of the key.
 */
export function stockProfileMatchKey(input: {
  isin?: string;
  yahooSymbol?: string;
  symbol: string;
  exchange?: string;
}): string {
  const isin = input.isin?.trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const yahoo = input.yahooSymbol?.trim().toUpperCase();
  if (yahoo) return `yahoo:${yahoo}`;
  return `sym:${String(input.exchange ?? "").toUpperCase()}:${input.symbol.trim().toUpperCase()}`;
}

/** FNV-1a over two seeds — same construction as `cashbackDocId`, dependency-free on purpose. */
function hash32(value: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function stockProfileId(matchKey: string): string {
  return `profile_${hash32(matchKey, 0x811c9dc5)}${hash32(matchKey, 0x01000193)}`;
}

/** Convenience: match key + id in one call for a given identity. */
export function resolveStockProfileId(identity: {
  isin?: string;
  yahooSymbol?: string;
  symbol: string;
  exchange?: string;
}): string {
  return stockProfileId(stockProfileMatchKey(identity));
}

export type StockProfileUpsert = { profileId: string; identity: StockProfileIdentity };

/**
 * Dedupes a batch of instrument identities (e.g. CSV import rows) down to one
 * upsert per unique instrument. Two rows for the same stock — a stale export
 * with a duplicate line, or two lots of the same holding — collapse to a
 * single profile write; the first row's identity fields win.
 */
export function planStockProfileUpserts(next: StockProfileIdentity[]): StockProfileUpsert[] {
  const seen = new Map<string, StockProfileUpsert>();
  for (const identity of next) {
    const key = stockProfileMatchKey(identity);
    if (seen.has(key)) continue;
    seen.set(key, { profileId: stockProfileId(key), identity });
  }
  return [...seen.values()];
}
