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
  { merchant: "Swiggy", category: "Food", subcategory: "Food Delivery" },
  { merchant: "Zomato", category: "Food", subcategory: "Food Delivery" },
  { merchant: "Dominos", category: "Food", subcategory: "Eating Out" },
  { merchant: "McDonalds", category: "Food", subcategory: "Eating Out" },
  { merchant: "Starbucks", category: "Food", subcategory: "Eating Out" },
  { merchant: "BigBasket", category: "Food", subcategory: "Groceries" },
  { merchant: "Blinkit", category: "Food", subcategory: "Groceries" },
  { merchant: "Zepto", category: "Food", subcategory: "Groceries" },
  { merchant: "JioMart", category: "Food", subcategory: "Groceries" },
  { merchant: "DMart", category: "Food", subcategory: "Groceries" },
  { merchant: "Uber", category: "Travel", subcategory: "Auto / Cab" },
  { merchant: "Ola", category: "Travel", subcategory: "Auto / Cab" },
  { merchant: "Rapido", category: "Travel", subcategory: "Auto / Cab" },
  { merchant: "IRCTC", category: "Travel", subcategory: "Train" },
  { merchant: "BPCL", category: "Travel", subcategory: "Petrol / Diesel" },
  { merchant: "HPCL", category: "Travel", subcategory: "Petrol / Diesel" },
  { merchant: "IOCL", category: "Travel", subcategory: "Petrol / Diesel" },
  { merchant: "Amazon", category: "Shopping", subcategory: "Online Shopping" },
  { merchant: "Flipkart", category: "Shopping", subcategory: "Online Shopping" },
  { merchant: "Myntra", category: "Shopping", subcategory: "Clothes & Footwear" },
  { merchant: "Meesho", category: "Shopping", subcategory: "Online Shopping" },
  { merchant: "Reliance", category: "Shopping", subcategory: "Other Shopping" },
  { merchant: "Netflix", category: "Entertainment", subcategory: "OTT / Music" },
  { merchant: "Spotify", category: "Entertainment", subcategory: "OTT / Music" },
  { merchant: "Hotstar", category: "Entertainment", subcategory: "OTT / Music" },
  { merchant: "YouTube", category: "Entertainment", subcategory: "OTT / Music" },
  { merchant: "BookMyShow", category: "Entertainment", subcategory: "Movies / Events" },
  { merchant: "Apple", category: "Entertainment", subcategory: "OTT / Music" },
  { merchant: "Airtel", category: "Bills", subcategory: "Mobile Recharge" },
  { merchant: "Jio", category: "Bills", subcategory: "Mobile Recharge" },
  { merchant: "BESCOM", category: "Home", subcategory: "Electricity" },
  { merchant: "Google", category: "Bills", subcategory: "Other Bills" },
  { merchant: "MakeMyTrip", category: "Travel", subcategory: "Other Travel" },
  { merchant: "Paytm", category: "Savings & EMI", subcategory: "Other" },
  { merchant: "PhonePe", category: "Savings & EMI", subcategory: "Other" },
  { merchant: "Google Pay", category: "Savings & EMI", subcategory: "Other" },
];
