import type { InstitutionType } from "../types/expense";

export type Institution = {
  id: string;
  name: string;
  type: InstitutionType;
  /** SMS / brand strings that identify this institution (not user display names). */
  aliases: string[];
};

/**
 * Static institution identity catalog.
 * Used to store `institutionId` separately from account display names.
 * Search UI uses `searchInstitutions`; SMS/alias resolution uses `lookupInstitution`.
 */
export const INSTITUTIONS: Institution[] = [
  {
    id: "super_money",
    name: "Super Money",
    type: "nbfc",
    aliases: ["super money", "super card", "supermoney", "super.money"],
  },
  { id: "sbi", name: "SBI", type: "bank", aliases: ["sbi", "state bank", "sbiin"] },
  { id: "hdfc", name: "HDFC", type: "bank", aliases: ["hdfc", "hdfcbk"] },
  { id: "icici", name: "ICICI", type: "bank", aliases: ["icici"] },
  { id: "axis", name: "Axis", type: "bank", aliases: ["axis", "axisbk"] },
  { id: "kotak", name: "Kotak", type: "bank", aliases: ["kotak"] },
  { id: "yes_bank", name: "Yes Bank", type: "bank", aliases: ["yes bank", "yesbank"] },
  { id: "idfc", name: "IDFC", type: "bank", aliases: ["idfc"] },
  { id: "pnb", name: "PNB", type: "bank", aliases: ["pnb", "punjab national"] },
  { id: "bob", name: "Bank of Baroda", type: "bank", aliases: ["bob", "bank of baroda"] },
  { id: "canara", name: "Canara", type: "bank", aliases: ["canara"] },
  { id: "union_bank", name: "Union Bank", type: "bank", aliases: ["union bank"] },
  { id: "indusind", name: "IndusInd", type: "bank", aliases: ["indusind"] },
  { id: "federal", name: "Federal", type: "bank", aliases: ["federal"] },
  { id: "rbl", name: "RBL", type: "bank", aliases: ["rbl"] },
  { id: "hsbc", name: "HSBC", type: "bank", aliases: ["hsbc"] },
  { id: "citi", name: "Citi", type: "bank", aliases: ["citi"] },
  { id: "amex", name: "American Express", type: "card_issuer", aliases: ["amex", "american express"] },
  { id: "paytm", name: "Paytm", type: "wallet", aliases: ["paytm"] },
  { id: "phonepe", name: "PhonePe", type: "wallet", aliases: ["phonepe", "phone pe"] },
  { id: "google_pay", name: "Google Pay", type: "wallet", aliases: ["google pay", "gpay"] },
  { id: "amazon_pay", name: "Amazon Pay", type: "wallet", aliases: ["amazon pay"] },
  { id: "fi", name: "Fi", type: "nbfc", aliases: ["fi", "epifi"] },
  { id: "jupiter", name: "Jupiter", type: "nbfc", aliases: ["jupiter"] },
  { id: "slice", name: "Slice", type: "card_issuer", aliases: ["slice"] },
  { id: "uni", name: "Uni", type: "card_issuer", aliases: ["uni cards", "uni"] },
];

export function foldInstitutionKey(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function slugifyInstitutionId(name: string): string {
  const folded = foldInstitutionKey(name);
  if (!folded) return "";
  return folded.replace(/([a-z])([0-9])/g, "$1_$2");
}

function aliasKeys(institution: Institution): string[] {
  const keys = [
    foldInstitutionKey(institution.id),
    foldInstitutionKey(institution.name),
    ...institution.aliases.map(foldInstitutionKey),
  ].filter((key) => key.length > 0);
  return [...new Set(keys)].sort((a, b) => b.length - a.length);
}

export function getInstitutionById(id?: string | null): Institution | undefined {
  const key = (id || "").trim().toLowerCase();
  if (!key) return undefined;
  return INSTITUTIONS.find((item) => item.id === key);
}

/**
 * Ranked catalog search for the account create/edit UI.
 * Empty query returns the full catalog A–Z so users can browse, then pick an exact row.
 */
export function searchInstitutions(query: string): Institution[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...INSTITUTIONS].sort((a, b) => a.name.localeCompare(b.name));
  }

  const folded = foldInstitutionKey(q);
  const scored: { institution: Institution; score: number }[] = [];

  for (const institution of INSTITUTIONS) {
    const name = institution.name.toLowerCase();
    const nameFolded = foldInstitutionKey(institution.name);
    let score = 0;
    if (name === q || nameFolded === folded) score = 1000;
    else if (name.startsWith(q) || nameFolded.startsWith(folded)) score = 800;
    else if (name.includes(q) || nameFolded.includes(folded)) score = 500;

    for (const alias of institution.aliases) {
      const aliasName = alias.toLowerCase();
      const aliasFolded = foldInstitutionKey(alias);
      if (aliasName === q || aliasFolded === folded) {
        score = Math.max(score, 900);
      } else if (aliasName.startsWith(q) || aliasFolded.startsWith(folded)) {
        score = Math.max(score, 700);
      } else if (aliasName.includes(q) || aliasFolded.includes(folded)) {
        score = Math.max(score, 400);
      }
    }

    if (score > 0) scored.push({ institution, score });
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score || a.institution.name.localeCompare(b.institution.name)
    )
    .map((row) => row.institution);
}

/**
 * Resolve an institution from a typed name, SMS fragment, or alias.
 * Longest alias wins. This is identity lookup, not a search UI.
 */
export function lookupInstitution(query: string): Institution | undefined {
  const folded = foldInstitutionKey(query);
  if (!folded) return undefined;

  let best: { institution: Institution; score: number } | undefined;
  for (const institution of INSTITUTIONS) {
    for (const key of aliasKeys(institution)) {
      const exact = folded === key;
      const contained = key.length >= 4 && folded.includes(key);
      if (!exact && !contained) continue;
      const score = exact ? 1000 + key.length : key.length;
      if (!best || score > best.score) best = { institution, score };
    }
  }
  return best?.institution;
}

function tokensOf(value: string): string[] {
  return (value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Infer institution from a legacy display name using catalog aliases.
 * Uses consecutive word tokens so "Super Money Credit Card" maps to Super Money
 * without treating the whole label as the institution id.
 */
export function inferInstitutionFromDisplayName(
  displayName: string
): Institution | undefined {
  const tokens = tokensOf(displayName);
  if (!tokens.length) return undefined;

  const foldedName = foldInstitutionKey(displayName);
  let best: { institution: Institution; score: number } | undefined;

  for (const institution of INSTITUTIONS) {
    for (const alias of [institution.name, ...institution.aliases]) {
      const aliasTokens = tokensOf(alias);
      if (!aliasTokens.length) continue;
      const aliasFolded = foldInstitutionKey(alias);
      const exact = foldedName === aliasFolded;
      const consecutive = hasConsecutiveTokens(tokens, aliasTokens);
      if (!exact && !consecutive) continue;
      const score = exact ? 1000 + aliasFolded.length : aliasFolded.length;
      if (!best || score > best.score) best = { institution, score };
    }
  }
  return best?.institution;
}

function hasConsecutiveTokens(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
