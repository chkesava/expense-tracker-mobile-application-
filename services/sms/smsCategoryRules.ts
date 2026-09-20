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
  { merchant: "Swiggy", category: "Food & Groceries", subcategory: "Food Delivery" },
  { merchant: "Zomato", category: "Food & Groceries", subcategory: "Food Delivery" },
  { merchant: "Dominos", category: "Food & Groceries", subcategory: "Restaurants & Dining" },
  { merchant: "McDonalds", category: "Food & Groceries", subcategory: "Restaurants & Dining" },
  { merchant: "Starbucks", category: "Food & Groceries", subcategory: "Cafes & Tea" },
  { merchant: "BigBasket", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { merchant: "Blinkit", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { merchant: "Zepto", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { merchant: "JioMart", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { merchant: "DMart", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { merchant: "Uber", category: "Transport & Vehicles", subcategory: "Cab / Taxi" },
  { merchant: "Ola", category: "Transport & Vehicles", subcategory: "Cab / Taxi" },
  { merchant: "Rapido", category: "Transport & Vehicles", subcategory: "Rapido / Ride Hailing" },
  { merchant: "IRCTC", category: "Transport & Vehicles", subcategory: "Train" },
  { merchant: "BPCL", category: "Transport & Vehicles", subcategory: "Petrol" },
  { merchant: "HPCL", category: "Transport & Vehicles", subcategory: "Petrol" },
  { merchant: "IOCL", category: "Transport & Vehicles", subcategory: "Petrol" },
  { merchant: "Amazon", category: "Shopping & Clothing", subcategory: "Online Shopping" },
  { merchant: "Flipkart", category: "Shopping & Clothing", subcategory: "Online Shopping" },
  { merchant: "Myntra", category: "Shopping & Clothing", subcategory: "Clothes" },
  { merchant: "Meesho", category: "Shopping & Clothing", subcategory: "Online Shopping" },
  { merchant: "Reliance", category: "Shopping & Clothing", subcategory: "Other Shopping" },
  { merchant: "Netflix", category: "Entertainment & Hobbies", subcategory: "OTT" },
  { merchant: "Spotify", category: "Entertainment & Hobbies", subcategory: "Music" },
  { merchant: "Hotstar", category: "Entertainment & Hobbies", subcategory: "OTT" },
  { merchant: "YouTube", category: "Entertainment & Hobbies", subcategory: "Streaming" },
  { merchant: "BookMyShow", category: "Entertainment & Hobbies", subcategory: "Movies" },
  { merchant: "Apple", category: "Entertainment & Hobbies", subcategory: "OTT" },
  { merchant: "Airtel", category: "Bills & Communication", subcategory: "Mobile Recharge" },
  { merchant: "Jio", category: "Bills & Communication", subcategory: "Mobile Recharge" },
  { merchant: "BESCOM", category: "Home & Household", subcategory: "Electricity" },
  { merchant: "Google", category: "Bills & Communication", subcategory: "Other Bills" },
  { merchant: "MakeMyTrip", category: "Travel & Holidays", subcategory: "Other Travel" },
  { merchant: "Paytm", category: "Miscellaneous", subcategory: "Uncategorized" },
  { merchant: "PhonePe", category: "Miscellaneous", subcategory: "Uncategorized" },
  { merchant: "Google Pay", category: "Miscellaneous", subcategory: "Uncategorized" },
];
