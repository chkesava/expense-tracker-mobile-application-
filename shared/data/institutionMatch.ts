import {
  INSTITUTIONS,
  foldInstitutionKey,
  hasConsecutiveTokens,
  institutionTextLabels,
  tokensOf,
  type Institution,
} from "./institutions";

/**
 * How a catalog row was identified. These sources are not interchangeable
 * with account `displayName`.
 */
export type InstitutionMatchSource =
  | "sender"
  | "name"
  | "alias"
  | "abbreviation"
  | "product"
  | "keyword";

export type InstitutionMatch = {
  institution: Institution;
  source: InstitutionMatchSource;
  matchedValue: string;
};

const GENERIC_QUERY_TOKENS = new Set([
  "account",
  "and",
  "bank",
  "card",
  "co",
  "corp",
  "credit",
  "debit",
  "finance",
  "india",
  "limited",
  "ltd",
  "money",
  "nbfc",
  "of",
  "savings",
  "the",
  "wallet",
]);

const SHORT_KEY_MAX = 5;

function isGenericToken(token: string): boolean {
  return GENERIC_QUERY_TOKENS.has(token);
}

function textLabelEntries(
  institution: Institution
): { value: string; source: InstitutionMatchSource }[] {
  return [
    { value: institution.name, source: "name" },
    ...institution.aliases.map((value) => ({ value, source: "alias" as const })),
    ...institution.abbreviations.map((value) => ({
      value,
      source: "abbreviation" as const,
    })),
    ...institution.productNames.map((value) => ({
      value,
      source: "product" as const,
    })),
  ];
}

/** DLT header after the operator prefix (`VM-SUPER` → `SUPER`). */
export function smsSenderHeader(sender: string): string {
  const trimmed = sender.trim().toUpperCase();
  if (!trimmed) return "";
  const dash = trimmed.lastIndexOf("-");
  if (dash >= 0 && dash < trimmed.length - 1) {
    return trimmed.slice(dash + 1);
  }
  return trimmed;
}

export function smsSenderMatchKeys(pattern: string): string[] {
  const full = foldInstitutionKey(pattern);
  const header = foldInstitutionKey(smsSenderHeader(pattern));
  return [...new Set([full, header].filter((key) => key.length > 0))];
}

function scoreTextLabel(
  queryFolded: string,
  queryTokens: string[],
  label: string
): number {
  const labelFolded = foldInstitutionKey(label);
  const labelTokens = tokensOf(label);
  if (!labelFolded) return 0;

  if (queryFolded === labelFolded) return 2000 + labelFolded.length;

  if (labelFolded.length > SHORT_KEY_MAX && queryFolded.includes(labelFolded)) {
    return 1000 + labelFolded.length;
  }

  if (labelTokens.length >= 2 && hasConsecutiveTokens(queryTokens, labelTokens)) {
    return 500 + labelFolded.length;
  }

  if (
    labelTokens.length === 1 &&
    labelFolded.length >= 4 &&
    queryTokens.includes(labelTokens[0]!) &&
    queryTokens.every((token) => token === labelTokens[0] || isGenericToken(token))
  ) {
    return 400 + labelFolded.length;
  }

  return 0;
}

/**
 * Resolve institution from a typed name, alias, abbreviation, or product name.
 * Never uses SMS senders or account displayName as identity.
 */
export function lookupInstitution(query: string): Institution | undefined {
  return matchInstitutionFromText(query)?.institution;
}

/**
 * Catalog resolution for a user-typed or legacy label.
 * Hydrate must not call this — displayName is not institution identity.
 */
export function inferInstitutionFromDisplayName(
  label: string
): Institution | undefined {
  return lookupInstitution(label);
}

export function matchInstitutionFromText(
  query: string
): InstitutionMatch | undefined {
  const folded = foldInstitutionKey(query);
  if (!folded) return undefined;
  const queryTokens = tokensOf(query);
  let best: { match: InstitutionMatch; score: number } | undefined;

  for (const institution of INSTITUTIONS) {
    for (const { value, source } of textLabelEntries(institution)) {
      const score = scoreTextLabel(folded, queryTokens, value);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = {
          score,
          match: { institution, source, matchedValue: value },
        };
      }
    }
  }

  return best?.match;
}

/**
 * Match only against `smsSenders`. Does not use name, product, or displayName.
 */
export function matchInstitutionFromSender(
  sender: string
): InstitutionMatch | undefined {
  const raw = sender.trim();
  if (!raw) return undefined;
  const senderFolded = foldInstitutionKey(raw);
  const headerFolded = foldInstitutionKey(smsSenderHeader(raw));
  if (!senderFolded && !headerFolded) return undefined;

  let best: { match: InstitutionMatch; score: number } | undefined;

  for (const institution of INSTITUTIONS) {
    for (const pattern of institution.smsSenders) {
      for (const key of smsSenderMatchKeys(pattern)) {
        const exact = senderFolded === key || headerFolded === key;
        const digitSuffix =
          key.length >= 4 &&
          headerFolded.startsWith(key) &&
          /^\d*$/.test(headerFolded.slice(key.length));
        if (!exact && !digitSuffix) continue;
        const score = exact ? 1000 + key.length : 500 + key.length;
        if (!best || score > best.score) {
          best = {
            score,
            match: {
              institution,
              source: "sender",
              matchedValue: pattern,
            },
          };
        }
      }
    }
  }

  return best?.match;
}

function matchInstitutionFromKeywords(
  body: string
): InstitutionMatch | undefined {
  const bodyTokens = tokensOf(body);
  if (bodyTokens.length === 0) return undefined;

  let best: { match: InstitutionMatch; score: number } | undefined;

  for (const institution of INSTITUTIONS) {
    for (const keyword of institution.smsKeywords) {
      const kwTokens = tokensOf(keyword);
      if (kwTokens.length === 0) continue;
      const hit =
        kwTokens.length === 1
          ? bodyTokens.includes(kwTokens[0]!)
          : hasConsecutiveTokens(bodyTokens, kwTokens);
      if (!hit) continue;
      const score = foldInstitutionKey(keyword).length;
      if (!best || score > best.score) {
        best = {
          score,
          match: {
            institution,
            source: "keyword",
            matchedValue: keyword,
          },
        };
      }
    }
  }

  return best?.match;
}

/**
 * SMS resolution order: sender header, then product/name/alias, then keywords.
 * Never reads account displayName.
 */
export function resolveInstitutionFromSms(input: {
  sender?: string | null;
  body?: string | null;
}): InstitutionMatch | undefined {
  const senderMatch = matchInstitutionFromSender(input.sender || "");
  if (senderMatch) return senderMatch;

  const body = (input.body || "").trim();
  if (!body) return undefined;

  const textMatch = matchInstitutionFromText(body);
  if (textMatch && (textMatch.source === "product" || textMatch.source === "name")) {
    return textMatch;
  }

  const keywordMatch = matchInstitutionFromKeywords(body);
  if (keywordMatch) return keywordMatch;
  return textMatch;
}

/** Folded identity keys for SMS account matching — never displayName. */
export function institutionSmsMatchKeys(institution: Institution): string[] {
  const keys: string[] = [
    foldInstitutionKey(institution.id),
    ...institutionTextLabels(institution).map(foldInstitutionKey),
  ];
  for (const sender of institution.smsSenders) {
    keys.push(...smsSenderMatchKeys(sender));
  }
  for (const keyword of institution.smsKeywords) {
    keys.push(foldInstitutionKey(keyword));
  }
  return [...new Set(keys.filter((key) => key.length > 0))];
}
