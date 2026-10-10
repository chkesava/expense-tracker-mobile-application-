/**
 * Canonical merchant registry (SPENDLY-188, epic SPENDLY-186).
 *
 * Bundled data only: no network lookups, no remote logos. Seeded from the
 * merchant catalog and its category rules, which are READ here and never
 * changed (recurring-detection keys and statement fingerprints depend on them), then
 * enriched with legal names, extra aliases and common Indian merchants.
 *
 * Adding a merchant or alias is a data edit to this file; `registryIssues`
 * (run by the tests) rejects duplicate ids, alias collisions, unfolded or
 * too-short aliases and category names that aren't in the taxonomy.
 *
 * Documented in docs/SPENDLY-188-merchant-normalization.md.
 */

import { MERCHANT_CATALOG } from "./merchantCatalog";
import { MERCHANT_CATEGORY_RULES } from "./merchantCategoryRules";
import type { Merchant } from "../types/merchant";
import { foldKey, merchantSlug, MERCHANT_LIMITS } from "../utils/merchantModel";
import { CATEGORY_TAXONOMY } from "./categoryTaxonomy";

/** Bumped whenever merchants, aliases or categories change. */
export const MERCHANT_REGISTRY_VERSION = 1;

/** Aliases shorter than this are rejected: too likely to collide. */
export const MIN_ALIAS_LENGTH = 3;

/**
 * Catalog aliases the registry leaves out because they collide with
 * something else in Indian narrations.
 * - "mcd": Municipal Corporation of Delhi payments, not McDonald's.
 */
const EXCLUDED_CATALOG_ALIASES = new Set(["mcd"]);

/** Seeded catalog rules that mean "no category" rather than a real suggestion. */
const isPlaceholderCategory = (category: string, subcategory: string) =>
  category === "Miscellaneous" && subcategory === "Uncategorized";

type Enrichment = { legalName?: string; aliases?: string[] };

/** Extra data for catalog-seeded merchants, keyed by the catalog's canonical name. */
const SEED_ENRICHMENT: Record<string, Enrichment> = {
  Swiggy: { legalName: "Swiggy Limited", aliases: ["bundltechnologies"] },
  Zomato: { legalName: "Zomato Limited" },
  Amazon: { legalName: "Amazon Seller Services Pvt Ltd", aliases: ["amazonsellerservices", "amazonpayindia"] },
  Flipkart: { legalName: "Flipkart Internet Pvt Ltd" },
  Myntra: { legalName: "Myntra Designs Pvt Ltd", aliases: ["myntradesigns"] },
  Meesho: { legalName: "Fashnear Technologies Pvt Ltd", aliases: ["fashneartechnologies"] },
  Uber: { legalName: "Uber India Systems Pvt Ltd", aliases: ["uberindiasystems"] },
  Ola: { legalName: "ANI Technologies Pvt Ltd", aliases: ["anitechnologies"] },
  Rapido: { legalName: "Roppen Transportation Services Pvt Ltd", aliases: ["roppentransportation", "roppentransportationservices"] },
  BigBasket: { legalName: "Innovative Retail Concepts Pvt Ltd", aliases: ["innovativeretailconcepts"] },
  Blinkit: { legalName: "Blink Commerce Pvt Ltd", aliases: ["blinkcommerce"] },
  Zepto: { legalName: "Kiranakart Technologies Pvt Ltd", aliases: ["kiranakart", "kiranakarttechnologies"] },
  BookMyShow: { legalName: "Big Tree Entertainment Pvt Ltd", aliases: ["bigtreeentertainment"] },
  Dominos: { legalName: "Jubilant FoodWorks Ltd", aliases: ["jubilantfoodworks"] },
  McDonalds: { aliases: ["mcdonalds", "hardcastlerestaurants", "connaughtplazarestaurants"] },
  Starbucks: { legalName: "Tata Starbucks Pvt Ltd", aliases: ["tatastarbucks"] },
  DMart: { legalName: "Avenue Supermarts Ltd" },
  Airtel: { legalName: "Bharti Airtel Ltd", aliases: ["bhartiairtel"] },
  Jio: { legalName: "Reliance Jio Infocomm Ltd", aliases: ["reliancejioinfocomm"] },
  BPCL: { legalName: "Bharat Petroleum Corporation Ltd" },
  HPCL: { legalName: "Hindustan Petroleum Corporation Ltd" },
  IOCL: { legalName: "Indian Oil Corporation Ltd", aliases: ["indianoilcorporation"] },
  IRCTC: { legalName: "Indian Railway Catering and Tourism Corporation Ltd", aliases: ["indianrailwaycateringandtourism"] },
};

type ExtraMerchant = {
  displayName: string;
  legalName?: string;
  aliases?: string[];
  category?: string;
  subcategory?: string;
};

const FOOD = "Food & Groceries";
const HOME = "Home & Household";
const TRANSPORT = "Transport & Vehicles";
const BILLS = "Bills & Communication";
const SHOPPING = "Shopping & Clothing";
const HEALTH = "Health & Medical";
const ENTERTAINMENT = "Entertainment & Hobbies";
const TRAVEL = "Travel & Holidays";
const FINANCE = "Finance, Loans & Insurance";
const INVEST = "Investments & Savings";

/** Common Indian merchants beyond the SMS catalog. */
const EXTRA_MERCHANTS: ExtraMerchant[] = [
  // Food & dining
  { displayName: "KFC", aliases: ["kfcindia"], category: FOOD, subcategory: "Restaurants & Dining" },
  { displayName: "Pizza Hut", category: FOOD, subcategory: "Restaurants & Dining" },
  { displayName: "Burger King", aliases: ["restaurantbrandsasia"], category: FOOD, subcategory: "Restaurants & Dining" },
  { displayName: "Subway", category: FOOD, subcategory: "Restaurants & Dining" },
  { displayName: "Haldiram's", aliases: ["haldiram"], category: FOOD, subcategory: "Restaurants & Dining" },
  { displayName: "Chaayos", category: FOOD, subcategory: "Cafes & Tea" },
  { displayName: "Third Wave Coffee", category: FOOD, subcategory: "Cafes & Tea" },
  { displayName: "Cafe Coffee Day", aliases: ["ccd"], category: FOOD, subcategory: "Cafes & Tea" },
  { displayName: "Licious", aliases: ["delightfulgourmet"], category: FOOD, subcategory: "Meat & Chicken" },
  { displayName: "FreshToHome", category: FOOD, subcategory: "Fish & Seafood" },
  { displayName: "Country Delight", category: FOOD, subcategory: "Milk & Dairy" },
  { displayName: "Dunzo", category: FOOD, subcategory: "Groceries / Kirana" },
  { displayName: "More Supermarket", aliases: ["moreretail"], category: FOOD, subcategory: "Groceries / Kirana" },
  { displayName: "Spencer's", aliases: ["spencersretail"], category: FOOD, subcategory: "Groceries / Kirana" },
  { displayName: "Star Bazaar", category: FOOD, subcategory: "Groceries / Kirana" },
  { displayName: "Ratnadeep", category: FOOD, subcategory: "Groceries / Kirana" },
  { displayName: "Nature's Basket", category: FOOD, subcategory: "Groceries / Kirana" },
  // Shopping
  { displayName: "Nykaa", aliases: ["nykaafashion", "fsnecommerce"], category: SHOPPING, subcategory: "Online Shopping" },
  { displayName: "AJIO", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Tata CLiQ", category: SHOPPING, subcategory: "Online Shopping" },
  { displayName: "Croma", aliases: ["infinitiretail"], category: SHOPPING, subcategory: "Electronics" },
  { displayName: "Reliance Digital", category: SHOPPING, subcategory: "Electronics" },
  { displayName: "Decathlon", category: SHOPPING, subcategory: "Other Shopping" },
  { displayName: "IKEA", category: HOME, subcategory: "Furniture" },
  { displayName: "Shoppers Stop", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Lifestyle", aliases: ["lifestylestores", "lifestyleinternational"], category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Westside", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Zudio", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Max Fashion", aliases: ["maxretail"], category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Pantaloons", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Zara", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Uniqlo", category: SHOPPING, subcategory: "Clothes" },
  { displayName: "Lenskart", category: HEALTH, subcategory: "Eye Care" },
  // Health
  { displayName: "Apollo Pharmacy", aliases: ["apollo247"], category: HEALTH, subcategory: "Pharmacy" },
  { displayName: "Tata 1mg", aliases: ["1mg"], category: HEALTH, subcategory: "Pharmacy" },
  { displayName: "PharmEasy", category: HEALTH, subcategory: "Pharmacy" },
  { displayName: "Netmeds", category: HEALTH, subcategory: "Pharmacy" },
  { displayName: "MedPlus", category: HEALTH, subcategory: "Pharmacy" },
  { displayName: "Practo", category: HEALTH, subcategory: "Doctor Consultation" },
  { displayName: "cult.fit", aliases: ["cultfit", "curefit"], category: HEALTH, subcategory: "Gym Membership" },
  // Fuel
  { displayName: "Shell", category: TRANSPORT, subcategory: "Petrol" },
  { displayName: "Nayara Energy", aliases: ["nayara"], category: TRANSPORT, subcategory: "Petrol" },
  // Travel
  { displayName: "redBus", category: TRAVEL, subcategory: "Bus" },
  { displayName: "Goibibo", category: TRAVEL, subcategory: "Other Travel" },
  { displayName: "Cleartrip", category: TRAVEL, subcategory: "Other Travel" },
  { displayName: "EaseMyTrip", category: TRAVEL, subcategory: "Other Travel" },
  { displayName: "Yatra", aliases: ["yatraonline"], category: TRAVEL, subcategory: "Other Travel" },
  { displayName: "IndiGo", legalName: "InterGlobe Aviation Ltd", aliases: ["interglobeaviation"], category: TRAVEL, subcategory: "Flights" },
  { displayName: "Air India", category: TRAVEL, subcategory: "Flights" },
  { displayName: "Akasa Air", category: TRAVEL, subcategory: "Flights" },
  { displayName: "SpiceJet", category: TRAVEL, subcategory: "Flights" },
  { displayName: "OYO", legalName: "Oravel Stays Ltd", aliases: ["oyorooms", "oravelstays"], category: TRAVEL, subcategory: "Hotel / Stay" },
  { displayName: "Airbnb", category: TRAVEL, subcategory: "Hotel / Stay" },
  // Entertainment
  { displayName: "PVR INOX", aliases: ["pvr", "inox", "pvrcinemas"], category: ENTERTAINMENT, subcategory: "Movies" },
  { displayName: "ZEE5", category: ENTERTAINMENT, subcategory: "OTT" },
  { displayName: "SonyLIV", category: ENTERTAINMENT, subcategory: "OTT" },
  { displayName: "Prime Video", aliases: ["amazonprime", "amazonprimevideo"], category: ENTERTAINMENT, subcategory: "OTT" },
  // Bills & utilities
  { displayName: "Vi", legalName: "Vodafone Idea Ltd", aliases: ["vodafoneidea", "vodafone"], category: BILLS, subcategory: "Mobile Recharge" },
  { displayName: "BSNL", category: BILLS, subcategory: "Mobile Recharge" },
  { displayName: "ACT Fibernet", aliases: ["atriaconvergence"], category: BILLS, subcategory: "Broadband / WiFi" },
  { displayName: "Hathway", category: BILLS, subcategory: "Broadband / WiFi" },
  { displayName: "Tata Play", aliases: ["tatasky"], category: BILLS, subcategory: "DTH" },
  { displayName: "Dish TV", category: BILLS, subcategory: "DTH" },
  { displayName: "Tata Power", category: HOME, subcategory: "Electricity" },
  { displayName: "Adani Electricity", category: HOME, subcategory: "Electricity" },
  { displayName: "MSEDCL", aliases: ["mahadiscom"], category: HOME, subcategory: "Electricity" },
  { displayName: "TANGEDCO", aliases: ["tneb"], category: HOME, subcategory: "Electricity" },
  { displayName: "BSES", aliases: ["bsesrajdhani", "bsesyamuna"], category: HOME, subcategory: "Electricity" },
  { displayName: "Indane", aliases: ["indanegas"], category: HOME, subcategory: "Cooking Gas / LPG" },
  { displayName: "HP Gas", category: HOME, subcategory: "Cooking Gas / LPG" },
  { displayName: "Bharat Gas", category: HOME, subcategory: "Cooking Gas / LPG" },
  { displayName: "Urban Company", aliases: ["urbanclap"], category: HOME, subcategory: "Repairs & Maintenance" },
  // Finance & investing
  { displayName: "CRED", aliases: ["dreamplug"], category: FINANCE, subcategory: "Credit Card Payment" },
  { displayName: "LIC", legalName: "Life Insurance Corporation of India", aliases: ["licofindia", "lifeinsurancecorporation", "lifeinsurancecorporationofindia"], category: FINANCE, subcategory: "Life Insurance" },
  { displayName: "PolicyBazaar", category: FINANCE, subcategory: "Other Insurance" },
  { displayName: "Zerodha", category: INVEST, subcategory: "Stocks" },
  { displayName: "Groww", aliases: ["nextbillion"], category: INVEST, subcategory: "Mutual Funds" },
  { displayName: "Upstox", category: INVEST, subcategory: "Stocks" },
  // Education
  { displayName: "Udemy", category: "Education", subcategory: "Online Courses" },
  { displayName: "Coursera", category: "Education", subcategory: "Online Courses" },
  { displayName: "Unacademy", aliases: ["sortinghat"], category: "Education", subcategory: "Online Courses" },
  { displayName: "BYJU'S", aliases: ["thinkandlearn"], category: "Education", subcategory: "Online Courses" },
  // Software
  { displayName: "Microsoft", category: BILLS, subcategory: "Software Subscription" },
  { displayName: "Adobe", category: BILLS, subcategory: "Software Subscription" },
  { displayName: "GitHub", category: BILLS, subcategory: "Software Subscription" },
  { displayName: "OpenAI", aliases: ["chatgpt"], category: BILLS, subcategory: "AI Tools" },
  { displayName: "GoDaddy", category: BILLS, subcategory: "Domain" },
  { displayName: "AWS", aliases: ["amazonwebservices"], category: BILLS, subcategory: "Hosting" },
];

/** Folded, de-duplicated aliases. Short keys ("Vi" → "vi") are dropped; such merchants match on longer aliases. */
function uniqueFolded(values: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const key = value ? foldKey(value) : "";
    if (key.length >= MIN_ALIAS_LENGTH && !out.includes(key)) out.push(key);
  }
  return out;
}

function buildRegistry(): Merchant[] {
  const merchants: Merchant[] = [];
  for (const entry of MERCHANT_CATALOG) {
    const rule = MERCHANT_CATEGORY_RULES.find((r) => foldKey(r.merchant) === foldKey(entry.canonical));
    const extra = SEED_ENRICHMENT[entry.canonical] ?? {};
    const aliases = uniqueFolded([entry.canonical, ...(entry.aliases ?? []), ...(extra.aliases ?? [])]).filter(
      (alias) => !EXCLUDED_CATALOG_ALIASES.has(alias)
    );
    merchants.push({
      id: merchantSlug(entry.canonical),
      displayName: entry.canonical,
      ...(extra.legalName ? { legalName: extra.legalName } : {}),
      aliases,
      ...(rule && !isPlaceholderCategory(rule.category, rule.subcategory)
        ? { category: rule.category, subcategory: rule.subcategory }
        : {}),
    });
  }
  for (const extra of EXTRA_MERCHANTS) {
    merchants.push({
      id: merchantSlug(extra.displayName),
      displayName: extra.displayName,
      ...(extra.legalName ? { legalName: extra.legalName } : {}),
      aliases: uniqueFolded([extra.displayName, ...(extra.aliases ?? [])]),
      ...(extra.category ? { category: extra.category } : {}),
      ...(extra.subcategory ? { subcategory: extra.subcategory } : {}),
    });
  }
  return merchants;
}

export const MERCHANT_REGISTRY: readonly Merchant[] = Object.freeze(buildRegistry());

export interface MerchantAliasIndex {
  /** Folded alias → merchant id. */
  byAlias: Map<string, string>;
  byId: Map<string, Merchant>;
  /** Aliases claimed by more than one merchant (first claim wins in `byAlias`). */
  conflicts: { alias: string; merchantIds: string[] }[];
}

/** One-pass lookup index over a merchant list (the bundled registry by default). */
export function buildMerchantAliasIndex(merchants: readonly Merchant[] = MERCHANT_REGISTRY): MerchantAliasIndex {
  const byAlias = new Map<string, string>();
  const byId = new Map<string, Merchant>();
  const conflicts: MerchantAliasIndex["conflicts"] = [];
  for (const merchant of merchants) {
    byId.set(merchant.id, merchant);
    for (const alias of merchant.aliases) {
      const owner = byAlias.get(alias);
      if (owner === undefined) byAlias.set(alias, merchant.id);
      else if (owner !== merchant.id) {
        const existing = conflicts.find((c) => c.alias === alias);
        if (existing) existing.merchantIds.push(merchant.id);
        else conflicts.push({ alias, merchantIds: [owner, merchant.id] });
      }
    }
  }
  return { byAlias, byId, conflicts };
}

/** Problems with a merchant list, as sentences. Empty = safe to ship. */
export function registryIssues(merchants: readonly Merchant[] = MERCHANT_REGISTRY): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const m of merchants) {
    if (!m.id || m.id !== merchantSlug(m.id)) issues.push(`${m.displayName}: id "${m.id}" isn't a slug.`);
    if (ids.has(m.id)) issues.push(`Duplicate merchant id "${m.id}".`);
    ids.add(m.id);
    if (!m.displayName.trim() || m.displayName.length > MERCHANT_LIMITS.name) issues.push(`${m.id}: display name is empty or too long.`);
    if (m.aliases.length === 0) issues.push(`${m.id}: no aliases.`);
    for (const alias of m.aliases) {
      if (alias !== foldKey(alias)) issues.push(`${m.id}: alias "${alias}" isn't folded.`);
      if (alias.length < MIN_ALIAS_LENGTH) issues.push(`${m.id}: alias "${alias}" is too short to match safely.`);
    }
    if (m.subcategory && !m.category) issues.push(`${m.id}: subcategory without a category.`);
    if (m.category) {
      const parent = CATEGORY_TAXONOMY.find((c) => c.name === m.category);
      if (!parent) issues.push(`${m.id}: unknown category "${m.category}".`);
      else if (m.subcategory && !parent.subcategories.some((s) => s.name === m.subcategory)) {
        issues.push(`${m.id}: "${m.subcategory}" isn't a subcategory of "${m.category}".`);
      }
    }
  }
  for (const c of buildMerchantAliasIndex(merchants).conflicts) {
    issues.push(`Alias "${c.alias}" is claimed by ${c.merchantIds.join(", ")}.`);
  }
  return issues;
}
