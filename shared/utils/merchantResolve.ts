/**
 * Deterministic merchant resolution (SPENDLY-189).
 *
 * This module only derives a resolution from source text and supplied
 * overrides. It never writes to a transaction, Firestore, or the SMS layer.
 */

import type {
  Merchant,
  MerchantOverride,
  MerchantResolution,
  MerchantSourceText,
} from "../types/merchant";
import { MERCHANT_INTELLIGENCE_VERSION } from "../types/merchant";
import { buildMerchantAliasIndex, MERCHANT_REGISTRY, MERCHANT_REGISTRY_VERSION } from "../data/merchantRegistry";
import { customMerchantId, foldKey } from "./merchantModel";
import { normalizeMerchantText, type NormalizedMerchantText } from "./merchantNormalize";

export const MERCHANT_RESOLUTION_VERSION = MERCHANT_INTELLIGENCE_VERSION;
export const UNKNOWN_MERCHANT_LABEL = "Unknown merchant";

export interface MerchantResolverOptions {
  merchants?: readonly Merchant[];
  /** Optional label used when the cleaned source has no safe display text. */
  unknownLabel?: string;
}

type ResolverContext = {
  merchants: readonly Merchant[];
  byId: Map<string, Merchant>;
  byAlias: Map<string, string>;
  conflicts: Set<string>;
  unknownLabel: string;
};

function contextFor(options: MerchantResolverOptions = {}): ResolverContext {
  const merchants = options.merchants ?? MERCHANT_REGISTRY;
  const index = buildMerchantAliasIndex(merchants);
  const conflicts = new Set(index.conflicts.map((conflict) => conflict.alias));
  return {
    merchants,
    byId: index.byId,
    byAlias: index.byAlias,
    conflicts,
    unknownLabel: options.unknownLabel ?? UNKNOWN_MERCHANT_LABEL,
  };
}

function displayFor(normalized: NormalizedMerchantText, context: ResolverContext): string {
  return normalized.display || context.unknownLabel;
}

function baseResolution(normalized: NormalizedMerchantText, context: ResolverContext): MerchantResolution {
  return {
    merchantId: null,
    displayName: displayFor(normalized, context),
    confidence: "unknown",
    method: "unresolved",
    rail: normalized.rail,
    raw: normalized.raw,
    normalized: normalized.normalized,
    version: MERCHANT_RESOLUTION_VERSION,
  };
}

function withMerchant(
  normalized: NormalizedMerchantText,
  merchant: Merchant,
  confidence: MerchantResolution["confidence"],
  method: MerchantResolution["method"],
  matchedBy: string,
): MerchantResolution {
  return {
    merchantId: merchant.id,
    displayName: merchant.displayName,
    confidence,
    method,
    rail: normalized.rail,
    raw: normalized.raw,
    normalized: normalized.normalized,
    matchedBy,
    ...(merchant.category ? { suggestedCategory: merchant.category } : {}),
    ...(merchant.subcategory ? { suggestedSubcategory: merchant.subcategory } : {}),
    version: MERCHANT_RESOLUTION_VERSION,
  };
}

function withCustomName(
  normalized: NormalizedMerchantText,
  name: string,
  method: "user_override" | "user_alias",
  matchedBy: string,
  override?: MerchantOverride,
): MerchantResolution {
  return {
    merchantId: customMerchantId(name),
    displayName: name.trim(),
    confidence: "high",
    method,
    rail: normalized.rail,
    raw: normalized.raw,
    normalized: normalized.normalized,
    matchedBy,
    ...(override?.category ? { suggestedCategory: override.category } : {}),
    ...(override?.subcategory ? { suggestedSubcategory: override.subcategory } : {}),
    version: MERCHANT_RESOLUTION_VERSION,
  };
}

function fromOverride(
  normalized: NormalizedMerchantText,
  override: MerchantOverride,
  method: "user_override" | "user_alias",
  context: ResolverContext,
): MerchantResolution | null {
  if (override.rejected) {
    const result = baseResolution(normalized, context);
    return { ...result, matchedBy: "user_rejected" };
  }
  if (override.customName?.trim()) {
    return withCustomName(normalized, override.customName, method, override.refKey, override);
  }
  if (override.merchantId) {
    const merchant = context.byId.get(override.merchantId);
    if (merchant) return withMerchant(normalized, merchant, "high", method, override.refKey);
  }
  return null;
}

function exactAlias(normalized: NormalizedMerchantText, context: ResolverContext): MerchantResolution | null {
  // Only the cleaned name is an exact high-confidence alias. VPA-local and
  // descriptor-detail hints are intentionally handled as medium-confidence rules.
  const key = normalized.display ? normalized.normalized : "";
  if (!key || context.conflicts.has(key)) return null;
  const merchantId = context.byAlias.get(key);
  const merchant = merchantId ? context.byId.get(merchantId) : undefined;
  return merchant ? withMerchant(normalized, merchant, "high", "alias_exact", key) : null;
}

function tokenBoundaryPrefix(key: string, tokens: string[]): boolean {
  let joined = "";
  for (let i = 0; i < tokens.length - 1; i += 1) {
    joined += foldKey(tokens[i]);
    if (joined === key) return true;
    if (joined.length > key.length) return false;
  }
  return false;
}

function deterministicRule(normalized: NormalizedMerchantText, context: ResolverContext): MerchantResolution | null {
  const candidates = [
    { key: normalized.vpa?.local, kind: "vpa-local" },
    { key: normalized.detail, kind: "descriptor-detail" },
  ].filter((candidate): candidate is { key: string; kind: string } => Boolean(candidate.key));

  for (const candidate of candidates) {
    if (context.conflicts.has(candidate.key)) continue;
    const merchantId = context.byAlias.get(candidate.key);
    const merchant = merchantId ? context.byId.get(merchantId) : undefined;
    if (merchant) return withMerchant(normalized, merchant, "medium", "rule", `${candidate.kind}:${candidate.key}`);
  }

  const joinedTokens = normalized.tokens.map(foldKey).join("");
  const matches: { alias: string; merchant: Merchant }[] = [];
  for (const [alias, merchantId] of context.byAlias) {
    if (context.conflicts.has(alias) || alias.length < 4 || !joinedTokens.startsWith(alias)) continue;
    if (!tokenBoundaryPrefix(alias, normalized.tokens)) continue;
    const merchant = context.byId.get(merchantId);
    if (merchant) matches.push({ alias, merchant });
  }
  matches.sort((a, b) => b.alias.length - a.alias.length || a.merchant.id.localeCompare(b.merchant.id));
  const match = matches[0];
  return match ? withMerchant(normalized, match.merchant, "medium", "rule", `prefix:${match.alias}`) : null;
}

function contextualGuess(
  source: MerchantSourceText,
  normalized: NormalizedMerchantText,
  context: ResolverContext,
): MerchantResolution | null {
  if (!source.category || normalized.tokens.length === 0) return null;
  const sourceTokens = new Set(normalized.tokens.map(foldKey));
  const candidates = context.merchants.flatMap((merchant) => {
    if (merchant.category !== source.category) return [];
    const overlap = merchant.displayName
      .split(/\s+/)
      .map(foldKey)
      .filter((token) => token.length >= 4 && sourceTokens.has(token));
    return overlap.length ? [{ merchant, score: overlap.length, token: overlap.sort()[0] }] : [];
  });
  candidates.sort((a, b) => b.score - a.score || a.merchant.id.localeCompare(b.merchant.id));
  if (candidates.length !== 1 || candidates[0].score < 1) return null;
  const match = candidates[0];
  return withMerchant(normalized, match.merchant, "low", "context", `category:${source.category};token:${match.token}`);
}

function overrideFor(source: MerchantSourceText, normalized: NormalizedMerchantText, overrides: readonly MerchantOverride[], context: ResolverContext) {
  const transaction = overrides.find((override) => override.kind === "transaction" && override.refKey === source.refKey);
  if (transaction) return fromOverride(normalized, transaction, "user_override", context);
  for (const candidate of normalized.candidates) {
    const alias = overrides.find((override) => override.kind === "alias" && override.refKey === candidate);
    if (alias) return fromOverride(normalized, alias, "user_alias", context);
  }
  return null;
}

export function resolveMerchant(
  source: MerchantSourceText,
  overrides: readonly MerchantOverride[] = [],
  options: MerchantResolverOptions = {},
): MerchantResolution {
  const normalized = normalizeMerchantText(source.text);
  const context = contextFor(options);
  const override = overrideFor(source, normalized, overrides, context);
  if (override) return override;
  return (
    exactAlias(normalized, context) ??
    deterministicRule(normalized, context) ??
    contextualGuess(source, normalized, context) ??
    baseResolution(normalized, context)
  );
}

/** Resolve a ledger slice in one pass, reusing normalization and resolutions by source text. */
export function resolveMerchants(
  sources: readonly MerchantSourceText[],
  overrides: readonly MerchantOverride[] = [],
  options: MerchantResolverOptions = {},
): MerchantResolution[] {
  const context = contextFor(options);
  const cache = new Map<string, MerchantResolution>();
  return sources.map((source) => {
    const normalized = normalizeMerchantText(source.text);
    const overrideVersion = overrides
      .map((override) => `${override.kind}:${override.refKey}:${override.updatedAtMs}:${override.merchantId ?? override.customName ?? "rejected"}`)
      .join("|");
    const cacheKey = `${source.refKey}|${normalized.raw}|${source.category ?? ""}|${overrideVersion}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const resolution = resolveWithNormalized(source, normalized, overrides, context);
    cache.set(cacheKey, resolution);
    return resolution;
  });
}

export const resolveMerchantBatch = resolveMerchants;

function resolveWithNormalized(
  source: MerchantSourceText,
  normalized: NormalizedMerchantText,
  overrides: readonly MerchantOverride[],
  context: ResolverContext,
): MerchantResolution {
  const override = overrideFor(source, normalized, overrides, context);
  if (override) return override;
  return (
    exactAlias(normalized, context) ??
    deterministicRule(normalized, context) ??
    contextualGuess(source, normalized, context) ??
    baseResolution(normalized, context)
  );
}

/** Exposed for tests and diagnostics; registry version is part of the audit context. */
export const MERCHANT_REGISTRY_RESOLUTION_VERSION = MERCHANT_REGISTRY_VERSION;
