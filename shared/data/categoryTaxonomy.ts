/** Default Category → Subcategory taxonomy for Indian household expenses. */

export interface TaxonomyNode {
  name: string;
  icon: string;
  subcategories: string[];
}

export type CategoryPair = { category: string; subcategory: string };

export const CATEGORY_TAXONOMY: TaxonomyNode[] = [
  {
    name: "Food",
    icon: "🍽",
    subcategories: [
      "Groceries",
      "Vegetables & Fruits",
      "Milk & Dairy",
      "Eating Out",
      "Food Delivery",
      "Other Food",
    ],
  },
  {
    name: "Home",
    icon: "🏠",
    subcategories: [
      "Rent",
      "Society Maintenance",
      "Electricity",
      "Water",
      "Cooking Gas",
      "Household Help",
      "Repairs & Furniture",
      "Other Home",
    ],
  },
  {
    name: "Travel",
    icon: "🚗",
    subcategories: [
      "Petrol / Diesel",
      "Auto / Cab",
      "Metro / Bus",
      "Train",
      "Flight",
      "Toll / Parking",
      "Vehicle Service",
      "Hotel / Stay",
      "Other Travel",
    ],
  },
  {
    name: "Bills",
    icon: "📱",
    subcategories: ["Mobile Recharge", "WiFi / Broadband", "DTH", "Other Bills"],
  },
  {
    name: "Shopping",
    icon: "🛍️",
    subcategories: [
      "Clothes & Footwear",
      "Online Shopping",
      "Electronics",
      "Personal Care",
      "Other Shopping",
    ],
  },
  {
    name: "Health",
    icon: "🩺",
    subcategories: ["Medicines", "Doctor / Hospital", "Gym / Fitness", "Other Health"],
  },
  {
    name: "Family",
    icon: "👨‍👩‍👧",
    subcategories: [
      "Family Support",
      "Kids",
      "Gifts",
      "Pooja / Temple",
      "Festival",
      "Other Family",
    ],
  },
  {
    name: "Education",
    icon: "📚",
    subcategories: [
      "School / College Fees",
      "Tuition / Coaching",
      "Courses / Books",
      "Other Education",
    ],
  },
  {
    name: "Entertainment",
    icon: "🎬",
    subcategories: [
      "Movies / Events",
      "OTT / Music",
      "Games / Hobbies",
      "Other Entertainment",
    ],
  },
  {
    name: "Savings & EMI",
    icon: "💳",
    subcategories: [
      "EMI",
      "Insurance",
      "SIP / Mutual Funds",
      "Gold",
      "Stocks",
      "Bank Charges / Tax",
      "Other",
    ],
  },
  {
    name: "Income",
    icon: "💰",
    subcategories: [
      "Salary",
      "Freelance / Business",
      "Cashback / Refund",
      "Other Income",
    ],
  },
  {
    name: "Other",
    icon: "📦",
    subcategories: ["Transfer", "Miscellaneous"],
  },
];

/** Top-level category names (replaces flat CATEGORIES for new seeds). */
export const PARENT_CATEGORY_NAMES = CATEGORY_TAXONOMY.map((c) => c.name);

export const DEFAULT_EXPENSE_CATEGORY = "Food";
export const DEFAULT_EXPENSE_SUBCATEGORY = "Groceries";

const CURRENT_PARENTS = new Set(PARENT_CATEGORY_NAMES);

function pairKey(category: string, subcategory: string): string {
  return `${category}::${subcategory}`;
}

function pair(category: string, subcategory: string): CategoryPair {
  return { category, subcategory };
}

/** Quick note → Category > Subcategory suggestions (longest keyword wins). */
export const CATEGORY_SUGGESTIONS: { keyword: string; category: string; subcategory: string }[] = [
  { keyword: "chicken for diet", category: "Health", subcategory: "Gym / Fitness" },
  { keyword: "eggs for diet", category: "Health", subcategory: "Gym / Fitness" },
  { keyword: "sbi bluechip", category: "Savings & EMI", subcategory: "SIP / Mutual Funds" },
  { keyword: "mutual fund", category: "Savings & EMI", subcategory: "SIP / Mutual Funds" },
  { keyword: "bike related", category: "Travel", subcategory: "Vehicle Service" },
  { keyword: "bike service", category: "Travel", subcategory: "Vehicle Service" },
  { keyword: "bike maintenance", category: "Travel", subcategory: "Vehicle Service" },
  { keyword: "movie tickets", category: "Entertainment", subcategory: "Movies / Events" },
  { keyword: "movie ticket", category: "Entertainment", subcategory: "Movies / Events" },
  { keyword: "coconut water", category: "Food", subcategory: "Other Food" },
  { keyword: "skin care", category: "Shopping", subcategory: "Personal Care" },
  { keyword: "skincare", category: "Shopping", subcategory: "Personal Care" },
  { keyword: "mobile recharge", category: "Bills", subcategory: "Mobile Recharge" },
  { keyword: "brother pocket", category: "Family", subcategory: "Family Support" },
  { keyword: "pocket money", category: "Family", subcategory: "Family Support" },
  { keyword: "tiffin", category: "Food", subcategory: "Eating Out" },
  { keyword: "curd", category: "Food", subcategory: "Milk & Dairy" },
  { keyword: "dahi", category: "Food", subcategory: "Milk & Dairy" },
  { keyword: "car service", category: "Travel", subcategory: "Vehicle Service" },
  { keyword: "cool drinks", category: "Food", subcategory: "Eating Out" },
  { keyword: "brother related", category: "Family", subcategory: "Family Support" },
  { keyword: "mother related", category: "Family", subcategory: "Family Support" },
  { keyword: "family support", category: "Family", subcategory: "Family Support" },
  { keyword: "silverbees", category: "Savings & EMI", subcategory: "Gold" },
  { keyword: "goldbees", category: "Savings & EMI", subcategory: "Gold" },
  { keyword: "chatgpt", category: "Bills", subcategory: "Other Bills" },
  { keyword: "claude", category: "Bills", subcategory: "Other Bills" },
  { keyword: "cursor", category: "Bills", subcategory: "Other Bills" },
  { keyword: "gemini", category: "Bills", subcategory: "Other Bills" },
  { keyword: "netflix", category: "Entertainment", subcategory: "OTT / Music" },
  { keyword: "hotstar", category: "Entertainment", subcategory: "OTT / Music" },
  { keyword: "spotify", category: "Entertainment", subcategory: "OTT / Music" },
  { keyword: "bitcoin", category: "Savings & EMI", subcategory: "Stocks" },
  { keyword: "petrol", category: "Travel", subcategory: "Petrol / Diesel" },
  { keyword: "diesel", category: "Travel", subcategory: "Petrol / Diesel" },
  { keyword: "fastag", category: "Travel", subcategory: "Toll / Parking" },
  { keyword: "paneer", category: "Food", subcategory: "Groceries" },
  { keyword: "kirana", category: "Food", subcategory: "Groceries" },
  { keyword: "chicken", category: "Food", subcategory: "Groceries" },
  { keyword: "grocery", category: "Food", subcategory: "Groceries" },
  { keyword: "groceries", category: "Food", subcategory: "Groceries" },
  { keyword: "sabzi", category: "Food", subcategory: "Vegetables & Fruits" },
  { keyword: "vegetables", category: "Food", subcategory: "Vegetables & Fruits" },
  { keyword: "medicine", category: "Health", subcategory: "Medicines" },
  { keyword: "medicines", category: "Health", subcategory: "Medicines" },
  { keyword: "hospital", category: "Health", subcategory: "Doctor / Hospital" },
  { keyword: "protein", category: "Health", subcategory: "Gym / Fitness" },
  { keyword: "gym", category: "Health", subcategory: "Gym / Fitness" },
  { keyword: "insurance", category: "Savings & EMI", subcategory: "Insurance" },
  { keyword: "mother", category: "Family", subcategory: "Family Support" },
  { keyword: "brother", category: "Family", subcategory: "Family Support" },
  { keyword: "father", category: "Family", subcategory: "Family Support" },
  { keyword: "sister", category: "Family", subcategory: "Family Support" },
  { keyword: "pooja", category: "Family", subcategory: "Pooja / Temple" },
  { keyword: "temple", category: "Family", subcategory: "Pooja / Temple" },
  { keyword: "diwali", category: "Family", subcategory: "Festival" },
  { keyword: "rent", category: "Home", subcategory: "Rent" },
  { keyword: "society", category: "Home", subcategory: "Society Maintenance" },
  { keyword: "electricity", category: "Home", subcategory: "Electricity" },
  { keyword: "maid", category: "Home", subcategory: "Household Help" },
  { keyword: "cylinder", category: "Home", subcategory: "Cooking Gas" },
  { keyword: "lpg", category: "Home", subcategory: "Cooking Gas" },
  { keyword: "eggs", category: "Food", subcategory: "Groceries" },
  { keyword: "zomato", category: "Food", subcategory: "Food Delivery" },
  { keyword: "swiggy", category: "Food", subcategory: "Food Delivery" },
  { keyword: "blinkit", category: "Food", subcategory: "Groceries" },
  { keyword: "zepto", category: "Food", subcategory: "Groceries" },
  { keyword: "uber", category: "Travel", subcategory: "Auto / Cab" },
  { keyword: "ola", category: "Travel", subcategory: "Auto / Cab" },
  { keyword: "rapido", category: "Travel", subcategory: "Auto / Cab" },
  { keyword: "irctc", category: "Travel", subcategory: "Train" },
  { keyword: "recharge", category: "Bills", subcategory: "Mobile Recharge" },
  { keyword: "tuition", category: "Education", subcategory: "Tuition / Coaching" },
  { keyword: "coaching", category: "Education", subcategory: "Tuition / Coaching" },
  { keyword: "sip", category: "Savings & EMI", subcategory: "SIP / Mutual Funds" },
];

/** Map legacy flat category names → current Category + Subcategory. */
export const LEGACY_CATEGORY_MAP: Record<string, CategoryPair> = {
  Food: pair("Food", "Other Food"),
  Rent: pair("Home", "Rent"),
  Travel: pair("Travel", "Other Travel"),
  Transport: pair("Travel", "Other Travel"),
  Accommodation: pair("Travel", "Hotel / Stay"),
  Shopping: pair("Shopping", "Other Shopping"),
  Utilities: pair("Home", "Electricity"),
  Entertainment: pair("Entertainment", "Other Entertainment"),
  Electrical: pair("Shopping", "Electronics"),
  Health: pair("Health", "Medicines"),
  Education: pair("Education", "Other Education"),
  Gifts: pair("Family", "Gifts"),
  Subscriptions: pair("Entertainment", "OTT / Music"),
  Insurance: pair("Savings & EMI", "Insurance"),
  "Brother Related": pair("Family", "Family Support"),
  "Mother Related": pair("Family", "Family Support"),
  EMIS: pair("Savings & EMI", "EMI"),
  Other: pair("Other", "Miscellaneous"),
  Uncategorized: pair("Other", "Miscellaneous"),
  Grocery: pair("Food", "Groceries"),
  Groceries: pair("Food", "Groceries"),
  Petrol: pair("Travel", "Petrol / Diesel"),
  "Cool Drinks": pair("Food", "Eating Out"),
  "Skin care": pair("Shopping", "Personal Care"),
  "Skin Care": pair("Shopping", "Personal Care"),
  "Bike related": pair("Travel", "Vehicle Service"),
  "Movie tickets": pair("Entertainment", "Movies / Events"),
  "Mobile Recharge": pair("Bills", "Mobile Recharge"),
  Tiffin: pair("Food", "Eating Out"),
  Curd: pair("Food", "Milk & Dairy"),
};

/**
 * v1 parent names that were renamed or removed.
 * Same-name parents (Health, Family, Shopping, …) are not listed here.
 */
export const V1_PARENT_MAP: Record<string, CategoryPair> = {
  Housing: pair("Home", "Other Home"),
  "Food & Dining": pair("Food", "Other Food"),
  "Fitness & Nutrition": pair("Health", "Gym / Fitness"),
  Transportation: pair("Travel", "Other Travel"),
  Technology: pair("Bills", "Other Bills"),
  Finance: pair("Savings & EMI", "Other"),
  Investments: pair("Savings & EMI", "Other"),
  Work: pair("Other", "Miscellaneous"),
  "Gifts & Donations": pair("Family", "Gifts"),
  Pets: pair("Other", "Miscellaneous"),
  Miscellaneous: pair("Other", "Miscellaneous"),
};

const V1_PAIR_ENTRIES: Array<[string, string, string, string]> = [
  // Housing → Home
  ["Housing", "Rent", "Home", "Rent"],
  ["Housing", "House Maintenance", "Home", "Society Maintenance"],
  ["Housing", "Furniture", "Home", "Repairs & Furniture"],
  ["Housing", "Appliances", "Home", "Repairs & Furniture"],
  ["Housing", "Utilities", "Home", "Electricity"],
  ["Housing", "Society Charges", "Home", "Society Maintenance"],
  ["Housing", "Other Housing", "Home", "Other Home"],
  // Food & Dining → Food
  ["Food & Dining", "Groceries", "Food", "Groceries"],
  ["Food & Dining", "Restaurant", "Food", "Eating Out"],
  ["Food & Dining", "Fast Food", "Food", "Eating Out"],
  ["Food & Dining", "Cafe", "Food", "Eating Out"],
  ["Food & Dining", "Snacks", "Food", "Eating Out"],
  ["Food & Dining", "Beverages", "Food", "Eating Out"],
  ["Food & Dining", "Milk & Dairy", "Food", "Milk & Dairy"],
  ["Food & Dining", "Fruits", "Food", "Vegetables & Fruits"],
  ["Food & Dining", "Vegetables", "Food", "Vegetables & Fruits"],
  ["Food & Dining", "Meat & Chicken", "Food", "Groceries"],
  ["Food & Dining", "Eggs", "Food", "Groceries"],
  ["Food & Dining", "Bakery", "Food", "Groceries"],
  ["Food & Dining", "Food Delivery", "Food", "Food Delivery"],
  ["Food & Dining", "Other Food", "Food", "Other Food"],
  // Fitness & Nutrition → Health
  ["Fitness & Nutrition", "Gym Membership", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Protein", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Supplements", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Healthy Food", "Food", "Other Food"],
  ["Fitness & Nutrition", "Sports Equipment", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Personal Training", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Other Fitness", "Health", "Gym / Fitness"],
  // Transportation → Travel
  ["Transportation", "Fuel", "Travel", "Petrol / Diesel"],
  ["Transportation", "Bike Maintenance", "Travel", "Vehicle Service"],
  ["Transportation", "Car Maintenance", "Travel", "Vehicle Service"],
  ["Transportation", "Parking", "Travel", "Toll / Parking"],
  ["Transportation", "Public Transport", "Travel", "Metro / Bus"],
  ["Transportation", "Cab", "Travel", "Auto / Cab"],
  ["Transportation", "Train", "Travel", "Train"],
  ["Transportation", "Bus", "Travel", "Metro / Bus"],
  ["Transportation", "Flight", "Travel", "Flight"],
  ["Transportation", "Travel", "Travel", "Other Travel"],
  ["Transportation", "Vehicle Insurance", "Savings & EMI", "Insurance"],
  ["Transportation", "Other Transportation", "Travel", "Other Travel"],
  // Health (same parent, remapped subs)
  ["Health", "Doctor", "Health", "Doctor / Hospital"],
  ["Health", "Medicines", "Health", "Medicines"],
  ["Health", "Hospital", "Health", "Doctor / Hospital"],
  ["Health", "Health Checkup", "Health", "Doctor / Hospital"],
  ["Health", "Dental", "Health", "Doctor / Hospital"],
  ["Health", "Vision", "Health", "Doctor / Hospital"],
  ["Health", "Mental Health", "Health", "Doctor / Hospital"],
  ["Health", "Skin Care", "Shopping", "Personal Care"],
  ["Health", "Grooming", "Shopping", "Personal Care"],
  ["Health", "Insurance", "Savings & EMI", "Insurance"],
  ["Health", "Other Health", "Health", "Other Health"],
  // Family
  ["Family", "Mother", "Family", "Family Support"],
  ["Family", "Father", "Family", "Family Support"],
  ["Family", "Brother", "Family", "Family Support"],
  ["Family", "Sister", "Family", "Family Support"],
  ["Family", "Children", "Family", "Kids"],
  ["Family", "Relatives", "Family", "Family Support"],
  ["Family", "Gifts", "Family", "Gifts"],
  ["Family", "Family Support", "Family", "Family Support"],
  ["Family", "Other Family", "Family", "Other Family"],
  // Technology
  ["Technology", "Software", "Bills", "Other Bills"],
  ["Technology", "AI Tools", "Bills", "Other Bills"],
  ["Technology", "Cloud Services", "Bills", "Other Bills"],
  ["Technology", "Hosting", "Bills", "Other Bills"],
  ["Technology", "Domains", "Bills", "Other Bills"],
  ["Technology", "Internet", "Bills", "WiFi / Broadband"],
  ["Technology", "Mobile Recharge", "Bills", "Mobile Recharge"],
  ["Technology", "Accessories", "Shopping", "Electronics"],
  ["Technology", "Electronics", "Shopping", "Electronics"],
  ["Technology", "Repairs", "Shopping", "Electronics"],
  ["Technology", "Other Technology", "Shopping", "Electronics"],
  // Finance
  ["Finance", "EMI", "Savings & EMI", "EMI"],
  ["Finance", "Credit Card Payment", "Savings & EMI", "Other"],
  ["Finance", "Loan Payment", "Savings & EMI", "EMI"],
  ["Finance", "Insurance", "Savings & EMI", "Insurance"],
  ["Finance", "Taxes", "Savings & EMI", "Bank Charges / Tax"],
  ["Finance", "Bank Charges", "Savings & EMI", "Bank Charges / Tax"],
  ["Finance", "Investment Transfer", "Savings & EMI", "SIP / Mutual Funds"],
  ["Finance", "Savings", "Savings & EMI", "Other"],
  ["Finance", "Other Finance", "Savings & EMI", "Other"],
  // Investments
  ["Investments", "Stocks", "Savings & EMI", "Stocks"],
  ["Investments", "ETFs", "Savings & EMI", "Stocks"],
  ["Investments", "Mutual Funds", "Savings & EMI", "SIP / Mutual Funds"],
  ["Investments", "Crypto", "Savings & EMI", "Stocks"],
  ["Investments", "Gold", "Savings & EMI", "Gold"],
  ["Investments", "Silver", "Savings & EMI", "Gold"],
  ["Investments", "Bonds", "Savings & EMI", "Stocks"],
  ["Investments", "SIP Investment", "Savings & EMI", "SIP / Mutual Funds"],
  ["Investments", "Investment Fees", "Savings & EMI", "Other"],
  ["Investments", "Other Investments", "Savings & EMI", "Other"],
  // Shopping
  ["Shopping", "Clothing", "Shopping", "Clothes & Footwear"],
  ["Shopping", "Footwear", "Shopping", "Clothes & Footwear"],
  ["Shopping", "Accessories", "Shopping", "Other Shopping"],
  ["Shopping", "Electronics", "Shopping", "Electronics"],
  ["Shopping", "Home Items", "Home", "Repairs & Furniture"],
  ["Shopping", "Furniture", "Home", "Repairs & Furniture"],
  ["Shopping", "Online Shopping", "Shopping", "Online Shopping"],
  ["Shopping", "Gifts", "Family", "Gifts"],
  ["Shopping", "Other Shopping", "Shopping", "Other Shopping"],
  // Entertainment
  ["Entertainment", "Movies", "Entertainment", "Movies / Events"],
  ["Entertainment", "OTT", "Entertainment", "OTT / Music"],
  ["Entertainment", "Music", "Entertainment", "OTT / Music"],
  ["Entertainment", "Games", "Entertainment", "Games / Hobbies"],
  ["Entertainment", "Books", "Education", "Courses / Books"],
  ["Entertainment", "Hobbies", "Entertainment", "Games / Hobbies"],
  ["Entertainment", "Events", "Entertainment", "Movies / Events"],
  ["Entertainment", "Subscriptions", "Entertainment", "OTT / Music"],
  ["Entertainment", "Other Entertainment", "Entertainment", "Other Entertainment"],
  // Education
  ["Education", "Courses", "Education", "Courses / Books"],
  ["Education", "Books", "Education", "Courses / Books"],
  ["Education", "Certifications", "Education", "Courses / Books"],
  ["Education", "Exams", "Education", "School / College Fees"],
  ["Education", "College", "Education", "School / College Fees"],
  ["Education", "Stationery", "Education", "Other Education"],
  ["Education", "Other Education", "Education", "Other Education"],
  // Work
  ["Work", "Office Expenses", "Other", "Miscellaneous"],
  ["Work", "Software", "Bills", "Other Bills"],
  ["Work", "Travel", "Travel", "Other Travel"],
  ["Work", "Client Meeting", "Other", "Miscellaneous"],
  ["Work", "Business Meals", "Food", "Eating Out"],
  ["Work", "Equipment", "Shopping", "Electronics"],
  ["Work", "Other Work", "Other", "Miscellaneous"],
  // Bills
  ["Bills", "Electricity", "Home", "Electricity"],
  ["Bills", "Water", "Home", "Water"],
  ["Bills", "Gas", "Home", "Cooking Gas"],
  ["Bills", "Internet", "Bills", "WiFi / Broadband"],
  ["Bills", "Phone", "Bills", "Mobile Recharge"],
  ["Bills", "DTH", "Bills", "DTH"],
  ["Bills", "Subscriptions", "Entertainment", "OTT / Music"],
  ["Bills", "Other Bills", "Bills", "Other Bills"],
  // Gifts & Donations
  ["Gifts & Donations", "Gift", "Family", "Gifts"],
  ["Gifts & Donations", "Donation", "Family", "Pooja / Temple"],
  ["Gifts & Donations", "Charity", "Family", "Pooja / Temple"],
  ["Gifts & Donations", "Festival", "Family", "Festival"],
  ["Gifts & Donations", "Birthday", "Family", "Gifts"],
  ["Gifts & Donations", "Wedding", "Family", "Festival"],
  ["Gifts & Donations", "Other Gifts", "Family", "Gifts"],
  // Pets
  ["Pets", "Food", "Other", "Miscellaneous"],
  ["Pets", "Vet", "Other", "Miscellaneous"],
  ["Pets", "Accessories", "Other", "Miscellaneous"],
  ["Pets", "Medicine", "Other", "Miscellaneous"],
  ["Pets", "Other Pets", "Other", "Miscellaneous"],
  // Travel (same parent, remapped subs)
  ["Travel", "Hotels", "Travel", "Hotel / Stay"],
  ["Travel", "Flights", "Travel", "Flight"],
  ["Travel", "Train", "Travel", "Train"],
  ["Travel", "Bus", "Travel", "Metro / Bus"],
  ["Travel", "Food", "Food", "Eating Out"],
  ["Travel", "Shopping", "Shopping", "Other Shopping"],
  ["Travel", "Activities", "Entertainment", "Movies / Events"],
  ["Travel", "Visa", "Travel", "Other Travel"],
  ["Travel", "Other Travel", "Travel", "Other Travel"],
  // Income
  ["Income", "Salary", "Income", "Salary"],
  ["Income", "Freelance", "Income", "Freelance / Business"],
  ["Income", "Bonus", "Income", "Salary"],
  ["Income", "Interest", "Income", "Cashback / Refund"],
  ["Income", "Refund", "Income", "Cashback / Refund"],
  ["Income", "Cashback", "Income", "Cashback / Refund"],
  ["Income", "Dividend", "Income", "Cashback / Refund"],
  ["Income", "Rental Income", "Income", "Freelance / Business"],
  ["Income", "Investment Profit", "Income", "Cashback / Refund"],
  ["Income", "Gift Received", "Income", "Other Income"],
  ["Income", "Other Income", "Income", "Other Income"],
  // Miscellaneous
  ["Miscellaneous", "Cash Withdrawal", "Other", "Transfer"],
  ["Miscellaneous", "Cash Deposit", "Other", "Transfer"],
  ["Miscellaneous", "Transfer", "Other", "Transfer"],
  ["Miscellaneous", "Unknown", "Other", "Miscellaneous"],
  ["Miscellaneous", "Other", "Other", "Miscellaneous"],
];

export const V1_TO_V2_MAP: Record<string, CategoryPair> = Object.fromEntries(
  V1_PAIR_ENTRIES.map(([oldCat, oldSub, newCat, newSub]) => [
    pairKey(oldCat, oldSub),
    pair(newCat, newSub),
  ])
);

/** Note-based overrides applied during migration (checked before LEGACY_CATEGORY_MAP). */
export const MIGRATION_NOTE_RULES: { match: RegExp; category: string; subcategory: string }[] = [
  { match: /chicken\s+for\s+diet/i, category: "Health", subcategory: "Gym / Fitness" },
  { match: /eggs\s+for\s+diet/i, category: "Health", subcategory: "Gym / Fitness" },
  {
    match: /\b(claude|cursor|chatgpt|gemini|openai|copilot)\b/i,
    category: "Bills",
    subcategory: "Other Bills",
  },
  {
    match: /\b(netflix|prime video|hotstar|disney\+|spotify)\b/i,
    category: "Entertainment",
    subcategory: "OTT / Music",
  },
  { match: /brother\s*related|\bbrother\b/i, category: "Family", subcategory: "Family Support" },
  { match: /mother\s*related|\bmother\b/i, category: "Family", subcategory: "Family Support" },
  { match: /\bpetrol\b|\bfuel\b|\bdiesel\b/i, category: "Travel", subcategory: "Petrol / Diesel" },
  { match: /cool\s*drinks?|\bbeverage/i, category: "Food", subcategory: "Eating Out" },
  { match: /\bgrocer/i, category: "Food", subcategory: "Groceries" },
  { match: /\bhealth\b|\bmedicine/i, category: "Health", subcategory: "Medicines" },
];

export function suggestCategoryFromNote(note: string): CategoryPair | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;

  const sorted = [...CATEGORY_SUGGESTIONS].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const s of sorted) {
    if (normalized.includes(s.keyword)) {
      return { category: s.category, subcategory: s.subcategory };
    }
  }
  return null;
}

function otherSubFor(node: TaxonomyNode): string {
  return (
    node.subcategories.find((s) => s === "Other" || s.startsWith("Other")) ??
    node.subcategories[node.subcategories.length - 1] ??
    "Miscellaneous"
  );
}

/**
 * Map a stored category/subcategory pair onto the current Indian taxonomy.
 * Returns null when the names look custom and should be left unchanged.
 */
export function mapToV2Category(
  category: string,
  subcategory?: string | null
): CategoryPair | null {
  const parent = (category || "").trim();
  const sub = (subcategory || "").trim();
  if (!parent) return null;

  if (sub) {
    const mappedPair = V1_TO_V2_MAP[pairKey(parent, sub)];
    if (mappedPair) return mappedPair;
  }

  const node = CATEGORY_TAXONOMY.find((c) => c.name === parent);
  if (node) {
    if (sub && node.subcategories.includes(sub)) {
      return { category: parent, subcategory: sub };
    }
    return { category: parent, subcategory: otherSubFor(node) };
  }

  const renamed = V1_PARENT_MAP[parent];
  if (renamed) return renamed;

  const legacy = LEGACY_CATEGORY_MAP[parent];
  if (legacy) return legacy;

  return null;
}

/**
 * Force any stored pair onto the current 12-parent taxonomy.
 * Used to collapse leftover custom parents/subs (Brother related, Tiffin, …).
 */
export function collapseToCurrentTaxonomy(
  category: string,
  subcategory?: string | null,
  note = ""
): CategoryPair {
  const parent = (category || "").trim();
  const sub = (subcategory || "").trim();

  const node = CATEGORY_TAXONOMY.find((c) => c.name === parent);
  if (node && sub && node.subcategories.includes(sub)) {
    return { category: parent, subcategory: sub };
  }

  const blobs = [[parent, sub].filter(Boolean).join(" "), parent, sub, note];
  for (const blob of blobs) {
    const suggestion = suggestCategoryFromNote(blob);
    if (suggestion) return suggestion;
  }

  const mapped = mapToV2Category(parent, sub || undefined);
  if (mapped) return mapped;

  const lower = parent.toLowerCase();
  for (const [legacyName, pairValue] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (legacyName.toLowerCase() === lower) return pairValue;
  }

  return mapLegacyExpense(parent, note || sub);
}

export function mapLegacyExpense(legacyCategory: string, note = ""): CategoryPair {
  for (const rule of MIGRATION_NOTE_RULES) {
    if (rule.match.test(note)) {
      return { category: rule.category, subcategory: rule.subcategory };
    }
  }

  const suggestion = suggestCategoryFromNote(note);
  if (suggestion) return suggestion;

  const mapped = mapToV2Category(legacyCategory, undefined);
  if (mapped) return mapped;

  return { category: "Other", subcategory: "Miscellaneous" };
}

export function getSubcategoriesFor(categoryName: string): string[] {
  return CATEGORY_TAXONOMY.find((c) => c.name === categoryName)?.subcategories ?? [];
}

export function getCategoryIcon(categoryName: string): string {
  return CATEGORY_TAXONOMY.find((c) => c.name === categoryName)?.icon ?? "📦";
}

export function isCurrentParentCategory(name: string): boolean {
  return CURRENT_PARENTS.has(name);
}
