/** Default Category → Subcategory taxonomy for Phase 1 hierarchy. */

export interface TaxonomyNode {
  name: string;
  icon: string;
  subcategories: string[];
}

export const CATEGORY_TAXONOMY: TaxonomyNode[] = [
  {
    name: "Housing",
    icon: "🏠",
    subcategories: [
      "Rent",
      "House Maintenance",
      "Furniture",
      "Appliances",
      "Utilities",
      "Society Charges",
      "Other Housing",
    ],
  },
  {
    name: "Food & Dining",
    icon: "🍽",
    subcategories: [
      "Groceries",
      "Restaurant",
      "Fast Food",
      "Cafe",
      "Snacks",
      "Beverages",
      "Milk & Dairy",
      "Fruits",
      "Vegetables",
      "Meat & Chicken",
      "Eggs",
      "Bakery",
      "Food Delivery",
      "Other Food",
    ],
  },
  {
    name: "Fitness & Nutrition",
    icon: "💪",
    subcategories: [
      "Gym Membership",
      "Protein",
      "Supplements",
      "Healthy Food",
      "Sports Equipment",
      "Personal Training",
      "Other Fitness",
    ],
  },
  {
    name: "Transportation",
    icon: "🚗",
    subcategories: [
      "Fuel",
      "Bike Maintenance",
      "Car Maintenance",
      "Parking",
      "Public Transport",
      "Cab",
      "Train",
      "Bus",
      "Flight",
      "Travel",
      "Vehicle Insurance",
      "Other Transportation",
    ],
  },
  {
    name: "Health",
    icon: "🩺",
    subcategories: [
      "Doctor",
      "Medicines",
      "Hospital",
      "Health Checkup",
      "Dental",
      "Vision",
      "Mental Health",
      "Skin Care",
      "Grooming",
      "Insurance",
      "Other Health",
    ],
  },
  {
    name: "Family",
    icon: "👨‍👩‍👧",
    subcategories: [
      "Mother",
      "Father",
      "Brother",
      "Sister",
      "Children",
      "Relatives",
      "Gifts",
      "Family Support",
      "Other Family",
    ],
  },
  {
    name: "Technology",
    icon: "💻",
    subcategories: [
      "Software",
      "AI Tools",
      "Cloud Services",
      "Hosting",
      "Domains",
      "Internet",
      "Mobile Recharge",
      "Accessories",
      "Electronics",
      "Repairs",
      "Other Technology",
    ],
  },
  {
    name: "Finance",
    icon: "💳",
    subcategories: [
      "EMI",
      "Credit Card Payment",
      "Loan Payment",
      "Insurance",
      "Taxes",
      "Bank Charges",
      "Investment Transfer",
      "Savings",
      "Other Finance",
    ],
  },
  {
    name: "Investments",
    icon: "📈",
    subcategories: [
      "Stocks",
      "ETFs",
      "Mutual Funds",
      "Crypto",
      "Gold",
      "Silver",
      "Bonds",
      "SIP Investment",
      "Investment Fees",
      "Other Investments",
    ],
  },
  {
    name: "Shopping",
    icon: "🛒",
    subcategories: [
      "Clothing",
      "Footwear",
      "Accessories",
      "Electronics",
      "Home Items",
      "Furniture",
      "Online Shopping",
      "Gifts",
      "Other Shopping",
    ],
  },
  {
    name: "Entertainment",
    icon: "🎬",
    subcategories: [
      "Movies",
      "OTT",
      "Music",
      "Games",
      "Books",
      "Hobbies",
      "Events",
      "Subscriptions",
      "Other Entertainment",
    ],
  },
  {
    name: "Education",
    icon: "📚",
    subcategories: [
      "Courses",
      "Books",
      "Certifications",
      "Exams",
      "College",
      "Stationery",
      "Other Education",
    ],
  },
  {
    name: "Work",
    icon: "💼",
    subcategories: [
      "Office Expenses",
      "Software",
      "Travel",
      "Client Meeting",
      "Business Meals",
      "Equipment",
      "Other Work",
    ],
  },
  {
    name: "Bills",
    icon: "🧾",
    subcategories: [
      "Electricity",
      "Water",
      "Gas",
      "Internet",
      "Phone",
      "DTH",
      "Subscriptions",
      "Other Bills",
    ],
  },
  {
    name: "Gifts & Donations",
    icon: "🎁",
    subcategories: [
      "Gift",
      "Donation",
      "Charity",
      "Festival",
      "Birthday",
      "Wedding",
      "Other Gifts",
    ],
  },
  {
    name: "Pets",
    icon: "🐶",
    subcategories: ["Food", "Vet", "Accessories", "Medicine", "Other Pets"],
  },
  {
    name: "Travel",
    icon: "✈",
    subcategories: [
      "Hotels",
      "Flights",
      "Train",
      "Bus",
      "Food",
      "Shopping",
      "Activities",
      "Visa",
      "Other Travel",
    ],
  },
  {
    name: "Income",
    icon: "💰",
    subcategories: [
      "Salary",
      "Freelance",
      "Bonus",
      "Interest",
      "Refund",
      "Cashback",
      "Dividend",
      "Rental Income",
      "Investment Profit",
      "Gift Received",
      "Other Income",
    ],
  },
  {
    name: "Miscellaneous",
    icon: "📦",
    subcategories: ["Cash Withdrawal", "Cash Deposit", "Transfer", "Unknown", "Other"],
  },
];

/** Top-level category names (replaces flat CATEGORIES for new seeds). */
export const PARENT_CATEGORY_NAMES = CATEGORY_TAXONOMY.map((c) => c.name);

/** Quick note → Category > Subcategory suggestions (longest keyword wins). */
export const CATEGORY_SUGGESTIONS: { keyword: string; category: string; subcategory: string }[] = [
  { keyword: "chicken for diet", category: "Fitness & Nutrition", subcategory: "Healthy Food" },
  { keyword: "eggs for diet", category: "Fitness & Nutrition", subcategory: "Healthy Food" },
  { keyword: "sbi bluechip", category: "Investments", subcategory: "Mutual Funds" },
  { keyword: "bike service", category: "Transportation", subcategory: "Bike Maintenance" },
  { keyword: "bike maintenance", category: "Transportation", subcategory: "Bike Maintenance" },
  { keyword: "cool drinks", category: "Food & Dining", subcategory: "Beverages" },
  { keyword: "brother related", category: "Family", subcategory: "Brother" },
  { keyword: "mother related", category: "Family", subcategory: "Mother" },
  { keyword: "silverbees", category: "Investments", subcategory: "ETFs" },
  { keyword: "goldbees", category: "Investments", subcategory: "ETFs" },
  { keyword: "chatgpt", category: "Technology", subcategory: "AI Tools" },
  { keyword: "claude", category: "Technology", subcategory: "AI Tools" },
  { keyword: "cursor", category: "Technology", subcategory: "AI Tools" },
  { keyword: "gemini", category: "Technology", subcategory: "AI Tools" },
  { keyword: "netflix", category: "Entertainment", subcategory: "Subscriptions" },
  { keyword: "hotstar", category: "Entertainment", subcategory: "OTT" },
  { keyword: "bitcoin", category: "Investments", subcategory: "Crypto" },
  { keyword: "petrol", category: "Transportation", subcategory: "Fuel" },
  { keyword: "diesel", category: "Transportation", subcategory: "Fuel" },
  { keyword: "paneer", category: "Food & Dining", subcategory: "Groceries" },
  { keyword: "chicken", category: "Food & Dining", subcategory: "Meat & Chicken" },
  { keyword: "grocery", category: "Food & Dining", subcategory: "Groceries" },
  { keyword: "groceries", category: "Food & Dining", subcategory: "Groceries" },
  { keyword: "medicine", category: "Health", subcategory: "Medicines" },
  { keyword: "medicines", category: "Health", subcategory: "Medicines" },
  { keyword: "hospital", category: "Health", subcategory: "Hospital" },
  { keyword: "protein", category: "Fitness & Nutrition", subcategory: "Protein" },
  { keyword: "gym", category: "Fitness & Nutrition", subcategory: "Gym Membership" },
  { keyword: "insurance", category: "Finance", subcategory: "Insurance" },
  { keyword: "mother", category: "Family", subcategory: "Mother" },
  { keyword: "brother", category: "Family", subcategory: "Brother" },
  { keyword: "father", category: "Family", subcategory: "Father" },
  { keyword: "sister", category: "Family", subcategory: "Sister" },
  { keyword: "rent", category: "Housing", subcategory: "Rent" },
  { keyword: "eggs", category: "Food & Dining", subcategory: "Eggs" },
  { keyword: "zomato", category: "Food & Dining", subcategory: "Food Delivery" },
  { keyword: "swiggy", category: "Food & Dining", subcategory: "Food Delivery" },
  { keyword: "uber", category: "Transportation", subcategory: "Cab" },
  { keyword: "ola", category: "Transportation", subcategory: "Cab" },
];

/** Map legacy flat category names → new Category + Subcategory. */
export const LEGACY_CATEGORY_MAP: Record<string, { category: string; subcategory: string }> = {
  Food: { category: "Food & Dining", subcategory: "Other Food" },
  Rent: { category: "Housing", subcategory: "Rent" },
  Travel: { category: "Travel", subcategory: "Other Travel" },
  Shopping: { category: "Shopping", subcategory: "Other Shopping" },
  Utilities: { category: "Bills", subcategory: "Other Bills" },
  Entertainment: { category: "Entertainment", subcategory: "Other Entertainment" },
  Electrical: { category: "Technology", subcategory: "Electronics" },
  Health: { category: "Health", subcategory: "Medicines" },
  Education: { category: "Education", subcategory: "Other Education" },
  Gifts: { category: "Gifts & Donations", subcategory: "Gift" },
  Subscriptions: { category: "Entertainment", subcategory: "Subscriptions" },
  Insurance: { category: "Finance", subcategory: "Insurance" },
  "Brother Related": { category: "Family", subcategory: "Brother" },
  "Mother Related": { category: "Family", subcategory: "Mother" },
  EMIS: { category: "Finance", subcategory: "EMI" },
  Other: { category: "Miscellaneous", subcategory: "Other" },
  Uncategorized: { category: "Miscellaneous", subcategory: "Unknown" },
  Grocery: { category: "Food & Dining", subcategory: "Groceries" },
  Groceries: { category: "Food & Dining", subcategory: "Groceries" },
  Petrol: { category: "Transportation", subcategory: "Fuel" },
  "Cool Drinks": { category: "Food & Dining", subcategory: "Beverages" },
};

/** Note-based overrides applied during migration (checked before LEGACY_CATEGORY_MAP). */
export const MIGRATION_NOTE_RULES: { match: RegExp; category: string; subcategory: string }[] = [
  { match: /chicken\s+for\s+diet/i, category: "Fitness & Nutrition", subcategory: "Healthy Food" },
  { match: /eggs\s+for\s+diet/i, category: "Fitness & Nutrition", subcategory: "Healthy Food" },
  { match: /\b(claude|cursor|chatgpt|gemini|openai|copilot)\b/i, category: "Technology", subcategory: "AI Tools" },
  { match: /\b(netflix|prime video|hotstar|disney\+|spotify)\b/i, category: "Entertainment", subcategory: "Subscriptions" },
  { match: /brother\s*related|\bbrother\b/i, category: "Family", subcategory: "Brother" },
  { match: /mother\s*related|\bmother\b/i, category: "Family", subcategory: "Mother" },
  { match: /\bpetrol\b|\bfuel\b|\bdiesel\b/i, category: "Transportation", subcategory: "Fuel" },
  { match: /cool\s*drinks?|\bbeverage/i, category: "Food & Dining", subcategory: "Beverages" },
  { match: /\bgrocer/i, category: "Food & Dining", subcategory: "Groceries" },
  { match: /\bhealth\b|\bmedicine/i, category: "Health", subcategory: "Medicines" },
];

export function suggestCategoryFromNote(
  note: string
): { category: string; subcategory: string } | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;

  // Prefer longer keywords first
  const sorted = [...CATEGORY_SUGGESTIONS].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const s of sorted) {
    if (normalized.includes(s.keyword)) {
      return { category: s.category, subcategory: s.subcategory };
    }
  }
  return null;
}

export function mapLegacyExpense(
  legacyCategory: string,
  note = ""
): { category: string; subcategory: string } {
  for (const rule of MIGRATION_NOTE_RULES) {
    if (rule.match.test(note)) {
      return { category: rule.category, subcategory: rule.subcategory };
    }
  }

  const suggestion = suggestCategoryFromNote(note);
  if (suggestion) return suggestion;

  const mapped = LEGACY_CATEGORY_MAP[legacyCategory];
  if (mapped) return mapped;

  // Already a parent in the new taxonomy?
  const parent = CATEGORY_TAXONOMY.find((c) => c.name === legacyCategory);
  if (parent) {
    return {
      category: parent.name,
      subcategory: parent.subcategories[0] ?? "Other",
    };
  }

  return { category: "Miscellaneous", subcategory: "Other" };
}

export function getSubcategoriesFor(categoryName: string): string[] {
  return CATEGORY_TAXONOMY.find((c) => c.name === categoryName)?.subcategories ?? [];
}

export function getCategoryIcon(categoryName: string): string {
  return CATEGORY_TAXONOMY.find((c) => c.name === categoryName)?.icon ?? "📦";
}
