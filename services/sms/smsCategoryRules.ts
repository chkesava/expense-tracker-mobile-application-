/**
 * Phase 7 — rule-based merchant → category mapping.
 * Uses existing taxonomy names (not AI).
 */

export type SmsCategoryRule = {
  merchant: string;
  category: string;
  subcategory: string;
};

/**
 * Canonical merchant (Phase 6) → Category / Subcategory.
 * Short labels in the phase brief (Food, Transport, Bills) map to taxonomy parents.
 */
export const SMS_MERCHANT_CATEGORY_RULES: SmsCategoryRule[] = [
  { merchant: "Swiggy", category: "Food & Dining", subcategory: "Food Delivery" },
  { merchant: "Zomato", category: "Food & Dining", subcategory: "Food Delivery" },
  { merchant: "Dominos", category: "Food & Dining", subcategory: "Fast Food" },
  { merchant: "McDonalds", category: "Food & Dining", subcategory: "Fast Food" },
  { merchant: "Starbucks", category: "Food & Dining", subcategory: "Cafe" },
  { merchant: "BigBasket", category: "Food & Dining", subcategory: "Groceries" },
  { merchant: "Blinkit", category: "Food & Dining", subcategory: "Groceries" },
  { merchant: "Zepto", category: "Food & Dining", subcategory: "Groceries" },
  { merchant: "JioMart", category: "Food & Dining", subcategory: "Groceries" },
  { merchant: "DMart", category: "Food & Dining", subcategory: "Groceries" },
  { merchant: "Uber", category: "Transportation", subcategory: "Cab" },
  { merchant: "Ola", category: "Transportation", subcategory: "Cab" },
  { merchant: "Rapido", category: "Transportation", subcategory: "Cab" },
  { merchant: "IRCTC", category: "Transportation", subcategory: "Train" },
  { merchant: "BPCL", category: "Transportation", subcategory: "Fuel" },
  { merchant: "HPCL", category: "Transportation", subcategory: "Fuel" },
  { merchant: "IOCL", category: "Transportation", subcategory: "Fuel" },
  { merchant: "Amazon", category: "Shopping", subcategory: "Online Shopping" },
  { merchant: "Flipkart", category: "Shopping", subcategory: "Online Shopping" },
  { merchant: "Myntra", category: "Shopping", subcategory: "Clothing" },
  { merchant: "Meesho", category: "Shopping", subcategory: "Online Shopping" },
  { merchant: "Reliance", category: "Shopping", subcategory: "Other Shopping" },
  { merchant: "Netflix", category: "Entertainment", subcategory: "OTT" },
  { merchant: "Spotify", category: "Entertainment", subcategory: "Music" },
  { merchant: "Hotstar", category: "Entertainment", subcategory: "OTT" },
  { merchant: "YouTube", category: "Entertainment", subcategory: "Subscriptions" },
  { merchant: "BookMyShow", category: "Entertainment", subcategory: "Movies" },
  { merchant: "Apple", category: "Entertainment", subcategory: "Subscriptions" },
  { merchant: "Airtel", category: "Bills", subcategory: "Phone" },
  { merchant: "Jio", category: "Bills", subcategory: "Phone" },
  { merchant: "BESCOM", category: "Bills", subcategory: "Electricity" },
  { merchant: "Google", category: "Technology", subcategory: "Cloud Services" },
  { merchant: "MakeMyTrip", category: "Travel", subcategory: "Other Travel" },
  { merchant: "Paytm", category: "Finance", subcategory: "Other Finance" },
  { merchant: "PhonePe", category: "Finance", subcategory: "Other Finance" },
  { merchant: "Google Pay", category: "Finance", subcategory: "Other Finance" },
];
