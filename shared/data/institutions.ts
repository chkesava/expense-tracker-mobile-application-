import type { InstitutionType } from "../types/expense";

/**
 * Catalog identity for a financial institution.
 * These fields are not interchangeable:
 * - `name` is the canonical institution name
 * - `aliases` / `abbreviations` are brand names
 * - `productNames` are cards/products (e.g. Super Card)
 * User account `displayName` is never stored here.
 */
export type Institution = {
  id: string;
  name: string;
  type: InstitutionType;
  aliases: string[];
  abbreviations: string[];
  productNames: string[];
};

type InstitutionInput = {
  id: string;
  name: string;
  type: InstitutionType;
  aliases?: string[];
  abbreviations?: string[];
  productNames?: string[];
};

function defineInstitution(input: InstitutionInput): Institution {
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    aliases: input.aliases ?? [],
    abbreviations: input.abbreviations ?? [],
    productNames: input.productNames ?? [],
  };
}

/**
 * Static institution identity catalog.
 * Search UI uses `searchInstitutions`.
 */
export const INSTITUTIONS: Institution[] = [
  defineInstitution({
    id: "super_money",
    name: "Super Money",
    type: "nbfc",
    aliases: ["super", "super money", "supermoney", "super.money"],
    productNames: [
      "super card",
      "super money card",
      "super money credit card",
    ],
  }),
  defineInstitution({
    id: "sbi",
    name: "SBI",
    type: "bank",
    aliases: ["sbi", "state bank"],
    abbreviations: ["sbi"],
  }),
  defineInstitution({
    id: "hdfc",
    name: "HDFC",
    type: "bank",
    aliases: ["hdfc"],
  }),
  defineInstitution({
    id: "icici",
    name: "ICICI",
    type: "bank",
    aliases: ["icici"],
  }),
  defineInstitution({
    id: "axis",
    name: "Axis",
    type: "bank",
    aliases: ["axis"],
  }),
  defineInstitution({
    id: "kotak",
    name: "Kotak",
    type: "bank",
    aliases: ["kotak"],
  }),
  defineInstitution({
    id: "yes_bank",
    name: "Yes Bank",
    type: "bank",
    aliases: ["yes bank", "yesbank"],
  }),
  defineInstitution({
    id: "idfc",
    name: "IDFC",
    type: "bank",
    aliases: ["idfc"],
  }),
  defineInstitution({
    id: "pnb",
    name: "PNB",
    type: "bank",
    aliases: ["pnb", "punjab national"],
  }),
  defineInstitution({
    id: "bob",
    name: "Bank of Baroda",
    type: "bank",
    aliases: ["bob", "bank of baroda"],
  }),
  defineInstitution({
    id: "canara",
    name: "Canara",
    type: "bank",
    aliases: ["canara"],
  }),
  defineInstitution({
    id: "union_bank",
    name: "Union Bank",
    type: "bank",
    aliases: ["union bank"],
  }),
  defineInstitution({
    id: "indusind",
    name: "IndusInd",
    type: "bank",
    aliases: ["indusind"],
  }),
  defineInstitution({
    id: "federal",
    name: "Federal",
    type: "bank",
    aliases: ["federal"],
  }),
  defineInstitution({
    id: "rbl",
    name: "RBL",
    type: "bank",
    aliases: ["rbl"],
  }),
  defineInstitution({
    id: "hsbc",
    name: "HSBC",
    type: "bank",
    aliases: ["hsbc"],
  }),
  defineInstitution({
    id: "citi",
    name: "Citi",
    type: "bank",
    aliases: ["citi"],
  }),
  defineInstitution({
    id: "amex",
    name: "American Express",
    type: "card_issuer",
    aliases: ["amex", "american express"],
    productNames: ["amex card"],
  }),
  defineInstitution({
    id: "paytm",
    name: "Paytm",
    type: "wallet",
    aliases: ["paytm"],
  }),
  defineInstitution({
    id: "phonepe",
    name: "PhonePe",
    type: "wallet",
    aliases: ["phonepe", "phone pe"],
  }),
  defineInstitution({
    id: "google_pay",
    name: "Google Pay",
    type: "wallet",
    aliases: ["google pay", "gpay"],
  }),
  defineInstitution({
    id: "amazon_pay",
    name: "Amazon Pay",
    type: "wallet",
    aliases: ["amazon pay"],
  }),
  defineInstitution({
    id: "fi",
    name: "Fi",
    type: "nbfc",
    aliases: ["fi", "epifi"],
  }),
  defineInstitution({
    id: "jupiter",
    name: "Jupiter",
    type: "nbfc",
    aliases: ["jupiter"],
  }),
  defineInstitution({
    id: "slice",
    name: "Slice",
    type: "card_issuer",
    aliases: ["slice"],
    productNames: ["slice card"],
  }),
  defineInstitution({
    id: "uni",
    name: "Uni",
    type: "card_issuer",
    aliases: ["uni", "uni cards"],
    productNames: ["uni card"],
  }),
];

export function foldInstitutionKey(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function slugifyInstitutionId(name: string): string {
  const folded = foldInstitutionKey(name);
  if (!folded) return "";
  return folded.replace(/([a-z])([0-9])/g, "$1_$2");
}

export function tokensOf(value: string): string[] {
  return (value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function hasConsecutiveTokens(
  haystack: string[],
  needle: string[]
): boolean {
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

export function getInstitutionById(id?: string | null): Institution | undefined {
  const key = (id || "").trim().toLowerCase();
  if (!key) return undefined;
  return INSTITUTIONS.find((item) => item.id === key);
}

/** Name / alias / product / abbreviation — never displayName. */
export function institutionTextLabels(institution: Institution): string[] {
  return [
    institution.name,
    ...institution.aliases,
    ...institution.abbreviations,
    ...institution.productNames,
  ].filter((value) => value.trim().length > 0);
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

    for (const label of institutionTextLabels(institution)) {
      const labelName = label.toLowerCase();
      const labelFolded = foldInstitutionKey(label);
      if (labelName === q || labelFolded === folded) {
        score = Math.max(score, 900);
      } else if (labelName.startsWith(q) || labelFolded.startsWith(folded)) {
        score = Math.max(score, 700);
      } else if (labelName.includes(q) || labelFolded.includes(folded)) {
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
