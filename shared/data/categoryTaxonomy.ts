/** Default Category → Subcategory taxonomy for Indian household expenses. */

export interface TaxonomySubcategory {
  key: string;
  name: string;
}

export interface TaxonomyNode {
  key: string;
  name: string;
  icon: string;
  hidden?: boolean;
  subcategories: TaxonomySubcategory[];
}

export type CategoryPair = { category: string; subcategory: string };

function sub(key: string, name: string): TaxonomySubcategory {
  return { key, name };
}

export const CATEGORY_TAXONOMY: TaxonomyNode[] = [
  {
    key: "food_groceries",
    name: "Food & Groceries",
    icon: "🍽",
    subcategories: [
      sub("groceries_kirana", "Groceries / Kirana"),
      sub("vegetables", "Vegetables"),
      sub("fruits", "Fruits"),
      sub("milk_dairy", "Milk & Dairy"),
      sub("eggs", "Eggs"),
      sub("meat_chicken", "Meat & Chicken"),
      sub("fish_seafood", "Fish & Seafood"),
      sub("rice_atta_grains", "Rice, Atta & Grains"),
      sub("pulses_lentils", "Pulses & Lentils"),
      sub("edible_oils", "Edible Oils"),
      sub("spices_masalas", "Spices & Masalas"),
      sub("snacks_packaged", "Snacks & Packaged Food"),
      sub("bakery", "Bakery"),
      sub("beverages", "Beverages / Cool Drinks"),
      sub("drinking_water", "Water"),
      sub("baby_food", "Baby Food"),
      sub("food_delivery", "Food Delivery"),
      sub("restaurants_dining", "Restaurants & Dining"),
      sub("cafes_tea", "Cafes & Tea"),
      sub("tiffin_meals", "Tiffin / Meals"),
      sub("catering", "Catering"),
      sub("other_food", "Other Food"),
    ],
  },
  {
    key: "home_household",
    name: "Home & Household",
    icon: "🏠",
    subcategories: [
      sub("rent", "Rent"),
      sub("society_maintenance", "Society / Maintenance"),
      sub("electricity", "Electricity"),
      sub("water", "Water"),
      sub("cooking_gas_lpg", "Cooking Gas / LPG"),
      sub("png_piped_gas", "PNG / Piped Gas"),
      sub("household_supplies", "Household Supplies"),
      sub("cleaning_supplies", "Cleaning Supplies"),
      sub("kitchen_supplies", "Kitchen Supplies"),
      sub("furniture", "Furniture"),
      sub("home_appliances", "Home Appliances"),
      sub("home_electronics", "Home Electronics"),
      sub("repairs_maintenance", "Repairs & Maintenance"),
      sub("plumbing", "Plumbing"),
      sub("electrical_repairs", "Electrical Repairs"),
      sub("pest_control", "Pest Control"),
      sub("domestic_help", "Domestic Help"),
      sub("maid", "Maid"),
      sub("cook", "Cook"),
      sub("driver", "Driver"),
      sub("gardener", "Gardener"),
      sub("security_watchman", "Security / Watchman"),
      sub("laundry", "Laundry / Dry Cleaning"),
      sub("other_home", "Other Home"),
    ],
  },
  {
    key: "transport_vehicles",
    name: "Transport & Vehicles",
    icon: "🚗",
    subcategories: [
      sub("petrol", "Petrol"),
      sub("diesel", "Diesel"),
      sub("cng", "CNG"),
      sub("ev_charging", "EV Charging"),
      sub("auto", "Auto"),
      sub("cab_taxi", "Cab / Taxi"),
      sub("rapido_ride_hailing", "Rapido / Ride Hailing"),
      sub("bus", "Bus"),
      sub("metro", "Metro"),
      sub("train", "Train"),
      sub("flight", "Flight"),
      sub("parking", "Parking"),
      sub("toll_fastag", "Toll / FASTag"),
      sub("vehicle_service", "Vehicle Service"),
      sub("vehicle_repairs", "Vehicle Repairs"),
      sub("tyres", "Tyres"),
      sub("vehicle_accessories", "Vehicle Accessories"),
      sub("car_wash", "Car Wash"),
      sub("other_transport", "Other Transport"),
    ],
  },
  {
    key: "bills_communication",
    name: "Bills & Communication",
    icon: "📱",
    subcategories: [
      sub("mobile_recharge", "Mobile Recharge"),
      sub("mobile_postpaid", "Mobile Postpaid"),
      sub("broadband_wifi", "Broadband / WiFi"),
      sub("dth", "DTH"),
      sub("landline", "Landline"),
      sub("cloud_storage", "Cloud Storage"),
      sub("software_subscription", "Software Subscription"),
      sub("ai_tools", "AI Tools"),
      sub("domain", "Domain"),
      sub("hosting", "Hosting"),
      sub("other_bills", "Other Bills"),
    ],
  },
  {
    key: "shopping_clothing",
    name: "Shopping & Clothing",
    icon: "🛍️",
    subcategories: [
      sub("clothes", "Clothes"),
      sub("footwear", "Footwear"),
      sub("accessories", "Accessories"),
      sub("jewellery", "Jewellery"),
      sub("online_shopping", "Online Shopping"),
      sub("electronics", "Electronics"),
      sub("mobile_phone", "Mobile Phone"),
      sub("laptop_computer", "Laptop / Computer"),
      sub("phone_accessories", "Phone Accessories"),
      sub("home_decor", "Home Decor"),
      sub("bags_luggage", "Bags / Luggage"),
      sub("watches", "Watches"),
      sub("gifts", "Gifts"),
      sub("other_shopping", "Other Shopping"),
    ],
  },
  {
    key: "health_medical",
    name: "Health & Medical",
    icon: "🩺",
    subcategories: [
      sub("doctor_consultation", "Doctor Consultation"),
      sub("hospital", "Hospital"),
      sub("dental", "Dental"),
      sub("eye_care", "Eye Care"),
      sub("diagnostic_tests", "Diagnostic Tests"),
      sub("medicines", "Medicines"),
      sub("pharmacy", "Pharmacy"),
      sub("health_checkup", "Health Checkup"),
      sub("physiotherapy", "Physiotherapy"),
      sub("mental_health", "Mental Health"),
      sub("medical_equipment", "Medical Equipment"),
      sub("gym_membership", "Gym Membership"),
      sub("fitness", "Fitness"),
      sub("sports", "Sports"),
      sub("supplements_nutrition", "Supplements / Nutrition"),
      sub("other_health", "Other Health"),
    ],
  },
  {
    key: "education",
    name: "Education",
    icon: "📚",
    subcategories: [
      sub("school_fees", "School Fees"),
      sub("college_fees", "College Fees"),
      sub("tuition", "Tuition"),
      sub("coaching", "Coaching"),
      sub("competitive_exams", "Competitive Exams"),
      sub("certification", "Certification"),
      sub("online_courses", "Online Courses"),
      sub("books", "Books"),
      sub("stationery", "Stationery"),
      sub("school_supplies", "School Supplies"),
      sub("uniform", "Uniform"),
      sub("education_equipment", "Education Equipment"),
      sub("student_accommodation", "Student Accommodation"),
      sub("other_education", "Other Education"),
    ],
  },
  {
    key: "family_children",
    name: "Family & Children",
    icon: "👨‍👩‍👧",
    subcategories: [
      sub("family_support", "Family Support"),
      sub("parents", "Parents"),
      sub("mother", "Mother"),
      sub("father", "Father"),
      sub("brother_sister", "Brother / Sister"),
      sub("children", "Children"),
      sub("childcare", "Childcare"),
      sub("baby_supplies", "Baby Supplies"),
      sub("toys", "Toys"),
      sub("pocket_money", "Pocket Money"),
      sub("family_medical", "Family Medical"),
      sub("family_travel", "Family Travel"),
      sub("family_activities", "Family Activities"),
      sub("other_family", "Other Family"),
    ],
  },
  {
    key: "personal_care",
    name: "Personal Care",
    icon: "💆",
    subcategories: [
      sub("salon", "Salon"),
      sub("haircut", "Haircut"),
      sub("grooming", "Grooming"),
      sub("skincare", "Skincare"),
      sub("cosmetics", "Cosmetics"),
      sub("toiletries", "Toiletries"),
      sub("spa", "Spa"),
      sub("massage", "Massage"),
      sub("personal_hygiene", "Personal Hygiene"),
      sub("other_personal_care", "Other Personal Care"),
    ],
  },
  {
    key: "entertainment_hobbies",
    name: "Entertainment & Hobbies",
    icon: "🎬",
    subcategories: [
      sub("movies", "Movies"),
      sub("events", "Events"),
      sub("concerts", "Concerts"),
      sub("ott", "OTT"),
      sub("music", "Music"),
      sub("games", "Games"),
      sub("gaming", "Gaming"),
      sub("books", "Books"),
      sub("hobbies", "Hobbies"),
      sub("sports_activities", "Sports Activities"),
      sub("photography", "Photography"),
      sub("streaming", "Streaming"),
      sub("other_entertainment", "Other Entertainment"),
    ],
  },
  {
    key: "travel_holidays",
    name: "Travel & Holidays",
    icon: "✈",
    subcategories: [
      sub("hotel_stay", "Hotel / Stay"),
      sub("flights", "Flights"),
      sub("train", "Train"),
      sub("bus", "Bus"),
      sub("local_transport", "Local Transport"),
      sub("travel_food", "Travel Food"),
      sub("travel_shopping", "Travel Shopping"),
      sub("sightseeing", "Sightseeing"),
      sub("activities", "Activities"),
      sub("tour_packages", "Tour Packages"),
      sub("visa_passport", "Visa / Passport"),
      sub("travel_insurance", "Travel Insurance"),
      sub("travel_documents", "Travel Documents"),
      sub("other_travel", "Other Travel"),
    ],
  },
  {
    key: "finance_loans_insurance",
    name: "Finance, Loans & Insurance",
    icon: "💳",
    subcategories: [
      sub("credit_card_payment", "Credit Card Payment"),
      sub("personal_loan_emi", "Personal Loan EMI"),
      sub("home_loan_emi", "Home Loan EMI"),
      sub("vehicle_loan_emi", "Vehicle Loan EMI"),
      sub("education_loan_emi", "Education Loan EMI"),
      sub("other_emi", "Other EMI"),
      sub("bank_charges", "Bank Charges"),
      sub("credit_card_fees", "Credit Card Fees"),
      sub("atm_fees", "ATM Fees"),
      sub("interest", "Interest"),
      sub("income_tax", "Income Tax"),
      sub("gst_other_tax", "GST / Other Tax"),
      sub("life_insurance", "Life Insurance"),
      sub("health_insurance", "Health Insurance"),
      sub("vehicle_insurance", "Vehicle Insurance"),
      sub("other_insurance", "Other Insurance"),
      sub("loan_fees", "Loan Fees"),
      sub("financial_service_fees", "Financial Service Fees"),
      sub("other_finance", "Other Finance"),
    ],
  },
  {
    key: "investments_savings",
    name: "Investments & Savings",
    icon: "📈",
    subcategories: [
      sub("savings", "Savings"),
      sub("emergency_fund", "Emergency Fund"),
      sub("sip", "SIP"),
      sub("mutual_funds", "Mutual Funds"),
      sub("stocks", "Stocks"),
      sub("etfs", "ETFs"),
      sub("bonds", "Bonds"),
      sub("fixed_deposit", "Fixed Deposit"),
      sub("recurring_deposit", "Recurring Deposit"),
      sub("ppf", "PPF"),
      sub("nps", "NPS"),
      sub("gold", "Gold"),
      sub("silver", "Silver"),
      sub("digital_gold", "Digital Gold"),
      sub("crypto", "Crypto"),
      sub("investment_fees", "Investment Fees"),
      sub("other_investments", "Other Investments"),
    ],
  },
  {
    key: "gifts_donations_social",
    name: "Gifts, Donations & Social",
    icon: "🎁",
    subcategories: [
      sub("birthday_gifts", "Birthday Gifts"),
      sub("wedding_gifts", "Wedding Gifts"),
      sub("anniversary_gifts", "Anniversary Gifts"),
      sub("festival_gifts", "Festival Gifts"),
      sub("religious_donations", "Religious Donations"),
      sub("temple", "Temple"),
      sub("charity", "Charity"),
      sub("community_pandal", "Community / Pandal"),
      sub("family_ceremonies", "Family Ceremonies"),
      sub("wedding_expenses", "Wedding Expenses"),
      sub("funeral_bereavement", "Funeral / Bereavement"),
      sub("other_social", "Other Social"),
    ],
  },
  {
    key: "pets",
    name: "Pets",
    icon: "🐶",
    subcategories: [
      sub("pet_food", "Pet Food"),
      sub("veterinary", "Veterinary"),
      sub("medicines", "Medicines"),
      sub("grooming", "Grooming"),
      sub("pet_supplies", "Pet Supplies"),
      sub("accessories", "Accessories"),
      sub("boarding", "Boarding"),
      sub("other_pets", "Other Pets"),
    ],
  },
  {
    key: "work_professional",
    name: "Work & Professional",
    icon: "💼",
    subcategories: [
      sub("office_supplies", "Office Supplies"),
      sub("work_equipment", "Work Equipment"),
      sub("software", "Software"),
      sub("ai_tools", "AI Tools"),
      sub("professional_membership", "Professional Membership"),
      sub("professional_courses", "Professional Courses"),
      sub("client_meals", "Client Meals"),
      sub("business_travel", "Business Travel"),
      sub("work_commute", "Work Commute"),
      sub("freelance_expenses", "Freelance Expenses"),
      sub("business_services", "Business Services"),
      sub("other_work", "Other Work"),
    ],
  },
  {
    key: "government_legal",
    name: "Government, Legal & Documents",
    icon: "🏛",
    subcategories: [
      sub("passport", "Passport"),
      sub("visa", "Visa"),
      sub("driving_licence", "Driving Licence"),
      sub("vehicle_registration", "Vehicle Registration"),
      sub("certificates", "Certificates"),
      sub("government_fees", "Government Fees"),
      sub("legal_fees", "Legal Fees"),
      sub("notary", "Notary"),
      sub("court_fees", "Court Fees"),
      sub("fines_penalties", "Fines / Penalties"),
      sub("other_government_legal", "Other Government / Legal"),
    ],
  },
  {
    key: "miscellaneous",
    name: "Miscellaneous",
    icon: "📦",
    subcategories: [
      sub("miscellaneous", "Miscellaneous"),
      sub("uncategorized", "Uncategorized"),
      sub("transfer", "Transfer"),
    ],
  },
  {
    key: "income",
    name: "Income",
    icon: "💰",
    hidden: true,
    subcategories: [
      sub("salary", "Salary"),
      sub("bonus", "Bonus"),
      sub("freelance", "Freelance"),
      sub("business_income", "Business Income"),
      sub("rental_income", "Rental Income"),
      sub("interest", "Interest"),
      sub("dividend", "Dividend"),
      sub("cashback", "Cashback"),
      sub("refund", "Refund"),
      sub("reimbursement", "Reimbursement"),
      sub("gift_received", "Gift Received"),
      sub("pension", "Pension"),
      sub("government_benefit", "Government Benefit"),
      sub("investment_proceeds", "Investment Proceeds"),
      sub("other_income", "Other Income"),
    ],
  },
];

/** v3 compact taxonomy — used only to interpret pre-v4 stored names. */
export const V3_CATEGORY_TAXONOMY: { name: string; subcategories: string[] }[] = [
  {
    name: "Food",
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
  { name: "Bills", subcategories: ["Mobile Recharge", "WiFi / Broadband", "DTH", "Other Bills"] },
  {
    name: "Shopping",
    subcategories: [
      "Clothes & Footwear",
      "Online Shopping",
      "Electronics",
      "Personal Care",
      "Other Shopping",
    ],
  },
  { name: "Health", subcategories: ["Medicines", "Doctor / Hospital", "Gym / Fitness", "Other Health"] },
  {
    name: "Family",
    subcategories: ["Family Support", "Kids", "Gifts", "Pooja / Temple", "Festival", "Other Family"],
  },
  {
    name: "Education",
    subcategories: ["School / College Fees", "Tuition / Coaching", "Courses / Books", "Other Education"],
  },
  {
    name: "Entertainment",
    subcategories: ["Movies / Events", "OTT / Music", "Games / Hobbies", "Other Entertainment"],
  },
  {
    name: "Savings & EMI",
    subcategories: ["EMI", "Insurance", "SIP / Mutual Funds", "Gold", "Stocks", "Bank Charges / Tax", "Other"],
  },
  {
    name: "Income",
    subcategories: ["Salary", "Freelance / Business", "Cashback / Refund", "Other Income"],
  },
  { name: "Other", subcategories: ["Transfer", "Miscellaneous"] },
];

export const PARENT_CATEGORY_NAMES = CATEGORY_TAXONOMY.filter((c) => !c.hidden).map((c) => c.name);
export const HIDDEN_TAXONOMY_PARENT_NAMES = new Set(
  CATEGORY_TAXONOMY.filter((c) => c.hidden).map((c) => c.name)
);

export const DEFAULT_EXPENSE_CATEGORY = "Food & Groceries";
export const DEFAULT_EXPENSE_SUBCATEGORY = "Groceries / Kirana";

const CURRENT_PARENTS = new Set(CATEGORY_TAXONOMY.map((c) => c.name));
const V3_PARENTS = new Set(V3_CATEGORY_TAXONOMY.map((c) => c.name));

export function taxonomyPairKey(category: string, subcategory: string): string {
  return `${category}::${subcategory}`;
}

function pairKey(category: string, subcategory: string): string {
  return taxonomyPairKey(category, subcategory);
}

function pair(category: string, subcategory: string): CategoryPair {
  return { category, subcategory };
}

export function subcategoryNamesOf(node: TaxonomyNode): string[] {
  return node.subcategories.map((s) => s.name);
}

export function isExactTaxonomyPair(category: string, subcategory: string): boolean {
  const node = CATEGORY_TAXONOMY.find((c) => c.name === category);
  return !!node && node.subcategories.some((s) => s.name === subcategory);
}

/** Parent aliases used to match existing default docs during v4 upsert. */
export const V3_PARENT_KEY_ALIASES: Record<string, string[]> = {
  food_groceries: ["Food & Groceries", "Food"],
  home_household: ["Home & Household", "Home"],
  transport_vehicles: ["Transport & Vehicles", "Travel"],
  bills_communication: ["Bills & Communication", "Bills"],
  shopping_clothing: ["Shopping & Clothing", "Shopping"],
  health_medical: ["Health & Medical", "Health"],
  education: ["Education"],
  family_children: ["Family & Children", "Family"],
  personal_care: ["Personal Care"],
  entertainment_hobbies: ["Entertainment & Hobbies", "Entertainment"],
  travel_holidays: ["Travel & Holidays"],
  finance_loans_insurance: ["Finance, Loans & Insurance", "Savings & EMI"],
  investments_savings: ["Investments & Savings"],
  gifts_donations_social: ["Gifts, Donations & Social"],
  pets: ["Pets"],
  work_professional: ["Work & Professional"],
  government_legal: ["Government, Legal & Documents"],
  miscellaneous: ["Miscellaneous", "Other"],
  income: ["Income"],
};

/** Old default subcategory name → new sub key, scoped by parent key. */
export const V3_SUB_KEY_ALIASES: Record<string, Record<string, string>> = {
  food_groceries: {
    Groceries: "groceries_kirana",
    "Groceries / Kirana": "groceries_kirana",
    "Vegetables & Fruits": "vegetables",
    "Milk & Dairy": "milk_dairy",
    "Eating Out": "restaurants_dining",
    "Food Delivery": "food_delivery",
    "Other Food": "other_food",
  },
  home_household: {
    Rent: "rent",
    "Society Maintenance": "society_maintenance",
    "Society / Maintenance": "society_maintenance",
    Electricity: "electricity",
    Water: "water",
    "Cooking Gas": "cooking_gas_lpg",
    "Cooking Gas / LPG": "cooking_gas_lpg",
    "Household Help": "domestic_help",
    "Repairs & Furniture": "repairs_maintenance",
    "Other Home": "other_home",
  },
  transport_vehicles: {
    "Petrol / Diesel": "petrol",
    Petrol: "petrol",
    "Auto / Cab": "cab_taxi",
    "Metro / Bus": "metro",
    Train: "train",
    Flight: "flight",
    "Toll / Parking": "toll_fastag",
    "Vehicle Service": "vehicle_service",
    "Other Travel": "other_transport",
    "Other Transport": "other_transport",
  },
  bills_communication: {
    "Mobile Recharge": "mobile_recharge",
    "WiFi / Broadband": "broadband_wifi",
    "Broadband / WiFi": "broadband_wifi",
    DTH: "dth",
    "Other Bills": "other_bills",
  },
  shopping_clothing: {
    "Clothes & Footwear": "clothes",
    Clothes: "clothes",
    "Online Shopping": "online_shopping",
    Electronics: "electronics",
    "Other Shopping": "other_shopping",
  },
  health_medical: {
    Medicines: "medicines",
    "Doctor / Hospital": "hospital",
    "Gym / Fitness": "gym_membership",
    "Other Health": "other_health",
  },
  education: {
    "School / College Fees": "school_fees",
    "Tuition / Coaching": "tuition",
    "Courses / Books": "books",
    "Other Education": "other_education",
  },
  family_children: {
    "Family Support": "family_support",
    Kids: "children",
    Children: "children",
    "Other Family": "other_family",
  },
  entertainment_hobbies: {
    "Movies / Events": "movies",
    "OTT / Music": "ott",
    "Games / Hobbies": "hobbies",
    "Other Entertainment": "other_entertainment",
  },
  finance_loans_insurance: {
    EMI: "other_emi",
    Insurance: "other_insurance",
    "Bank Charges / Tax": "bank_charges",
    Other: "other_finance",
    "Other Finance": "other_finance",
  },
  investments_savings: {
    "SIP / Mutual Funds": "sip",
    Gold: "gold",
    Stocks: "stocks",
  },
  miscellaneous: {
    Transfer: "transfer",
    Miscellaneous: "miscellaneous",
    Uncategorized: "uncategorized",
  },
  income: {
    Salary: "salary",
    "Freelance / Business": "freelance",
    "Cashback / Refund": "cashback",
    "Other Income": "other_income",
  },
};

export const V3_PARENT_TO_V4: Record<string, CategoryPair> = {
  Food: pair("Food & Groceries", "Other Food"),
  Home: pair("Home & Household", "Other Home"),
  Travel: pair("Transport & Vehicles", "Other Transport"),
  Bills: pair("Bills & Communication", "Other Bills"),
  Shopping: pair("Shopping & Clothing", "Other Shopping"),
  Health: pair("Health & Medical", "Other Health"),
  Family: pair("Family & Children", "Other Family"),
  Education: pair("Education", "Other Education"),
  Entertainment: pair("Entertainment & Hobbies", "Other Entertainment"),
  "Savings & EMI": pair("Finance, Loans & Insurance", "Other Finance"),
  Income: pair("Miscellaneous", "Uncategorized"),
  Other: pair("Miscellaneous", "Uncategorized"),
};

const V3_PAIR_ENTRIES: Array<[string, string, string, string]> = [
  ["Food", "Groceries", "Food & Groceries", "Groceries / Kirana"],
  ["Food", "Vegetables & Fruits", "Food & Groceries", "Vegetables"],
  ["Food", "Milk & Dairy", "Food & Groceries", "Milk & Dairy"],
  ["Food", "Eating Out", "Food & Groceries", "Restaurants & Dining"],
  ["Food", "Food Delivery", "Food & Groceries", "Food Delivery"],
  ["Food", "Other Food", "Food & Groceries", "Other Food"],
  ["Home", "Rent", "Home & Household", "Rent"],
  ["Home", "Society Maintenance", "Home & Household", "Society / Maintenance"],
  ["Home", "Electricity", "Home & Household", "Electricity"],
  ["Home", "Water", "Home & Household", "Water"],
  ["Home", "Cooking Gas", "Home & Household", "Cooking Gas / LPG"],
  ["Home", "Household Help", "Home & Household", "Domestic Help"],
  ["Home", "Repairs & Furniture", "Home & Household", "Repairs & Maintenance"],
  ["Home", "Other Home", "Home & Household", "Other Home"],
  ["Travel", "Petrol / Diesel", "Transport & Vehicles", "Petrol"],
  ["Travel", "Auto / Cab", "Transport & Vehicles", "Cab / Taxi"],
  ["Travel", "Metro / Bus", "Transport & Vehicles", "Metro"],
  ["Travel", "Train", "Transport & Vehicles", "Train"],
  ["Travel", "Flight", "Travel & Holidays", "Flights"],
  ["Travel", "Toll / Parking", "Transport & Vehicles", "Toll / FASTag"],
  ["Travel", "Vehicle Service", "Transport & Vehicles", "Vehicle Service"],
  ["Travel", "Hotel / Stay", "Travel & Holidays", "Hotel / Stay"],
  ["Travel", "Other Travel", "Transport & Vehicles", "Other Transport"],
  ["Bills", "Mobile Recharge", "Bills & Communication", "Mobile Recharge"],
  ["Bills", "WiFi / Broadband", "Bills & Communication", "Broadband / WiFi"],
  ["Bills", "DTH", "Bills & Communication", "DTH"],
  ["Bills", "Other Bills", "Bills & Communication", "Other Bills"],
  ["Shopping", "Clothes & Footwear", "Shopping & Clothing", "Clothes"],
  ["Shopping", "Online Shopping", "Shopping & Clothing", "Online Shopping"],
  ["Shopping", "Electronics", "Shopping & Clothing", "Electronics"],
  ["Shopping", "Personal Care", "Personal Care", "Other Personal Care"],
  ["Shopping", "Other Shopping", "Shopping & Clothing", "Other Shopping"],
  ["Health", "Medicines", "Health & Medical", "Medicines"],
  ["Health", "Doctor / Hospital", "Health & Medical", "Hospital"],
  ["Health", "Gym / Fitness", "Health & Medical", "Gym Membership"],
  ["Health", "Other Health", "Health & Medical", "Other Health"],
  ["Family", "Family Support", "Family & Children", "Family Support"],
  ["Family", "Kids", "Family & Children", "Children"],
  ["Family", "Gifts", "Gifts, Donations & Social", "Birthday Gifts"],
  ["Family", "Pooja / Temple", "Gifts, Donations & Social", "Temple"],
  ["Family", "Festival", "Gifts, Donations & Social", "Festival Gifts"],
  ["Family", "Other Family", "Family & Children", "Other Family"],
  ["Education", "School / College Fees", "Education", "School Fees"],
  ["Education", "Tuition / Coaching", "Education", "Tuition"],
  ["Education", "Courses / Books", "Education", "Books"],
  ["Education", "Other Education", "Education", "Other Education"],
  ["Entertainment", "Movies / Events", "Entertainment & Hobbies", "Movies"],
  ["Entertainment", "OTT / Music", "Entertainment & Hobbies", "OTT"],
  ["Entertainment", "Games / Hobbies", "Entertainment & Hobbies", "Hobbies"],
  ["Entertainment", "Other Entertainment", "Entertainment & Hobbies", "Other Entertainment"],
  ["Savings & EMI", "EMI", "Finance, Loans & Insurance", "Other EMI"],
  ["Savings & EMI", "Insurance", "Finance, Loans & Insurance", "Other Insurance"],
  ["Savings & EMI", "SIP / Mutual Funds", "Investments & Savings", "SIP"],
  ["Savings & EMI", "Gold", "Investments & Savings", "Gold"],
  ["Savings & EMI", "Stocks", "Investments & Savings", "Stocks"],
  ["Savings & EMI", "Bank Charges / Tax", "Finance, Loans & Insurance", "Bank Charges"],
  ["Savings & EMI", "Other", "Finance, Loans & Insurance", "Other Finance"],
  ["Income", "Salary", "Miscellaneous", "Uncategorized"],
  ["Income", "Freelance / Business", "Miscellaneous", "Uncategorized"],
  ["Income", "Cashback / Refund", "Miscellaneous", "Uncategorized"],
  ["Income", "Other Income", "Miscellaneous", "Uncategorized"],
  ["Other", "Transfer", "Miscellaneous", "Transfer"],
  ["Other", "Miscellaneous", "Miscellaneous", "Uncategorized"],
];

export const V3_TO_V4_MAP: Record<string, CategoryPair> = Object.fromEntries(
  V3_PAIR_ENTRIES.map(([oldCat, oldSub, newCat, newSub]) => [
    pairKey(oldCat, oldSub),
    pair(newCat, newSub),
  ])
);

/** Quick note → Category > Subcategory suggestions (longest keyword wins). */
export const CATEGORY_SUGGESTIONS: { keyword: string; category: string; subcategory: string }[] = [
  { keyword: "chicken for diet", category: "Health & Medical", subcategory: "Supplements / Nutrition" },
  { keyword: "eggs for diet", category: "Health & Medical", subcategory: "Supplements / Nutrition" },
  { keyword: "credit card payment", category: "Finance, Loans & Insurance", subcategory: "Credit Card Payment" },
  { keyword: "credit card bill", category: "Finance, Loans & Insurance", subcategory: "Credit Card Payment" },
  { keyword: "sbi bluechip", category: "Investments & Savings", subcategory: "Mutual Funds" },
  { keyword: "mutual fund", category: "Investments & Savings", subcategory: "Mutual Funds" },
  { keyword: "bike related", category: "Transport & Vehicles", subcategory: "Vehicle Service" },
  { keyword: "bike service", category: "Transport & Vehicles", subcategory: "Vehicle Service" },
  { keyword: "bike maintenance", category: "Transport & Vehicles", subcategory: "Vehicle Service" },
  { keyword: "movie tickets", category: "Entertainment & Hobbies", subcategory: "Movies" },
  { keyword: "movie ticket", category: "Entertainment & Hobbies", subcategory: "Movies" },
  { keyword: "coconut water", category: "Food & Groceries", subcategory: "Beverages / Cool Drinks" },
  { keyword: "gas cylinder", category: "Home & Household", subcategory: "Cooking Gas / LPG" },
  { keyword: "skin care", category: "Personal Care", subcategory: "Skincare" },
  { keyword: "skincare", category: "Personal Care", subcategory: "Skincare" },
  { keyword: "mobile recharge", category: "Bills & Communication", subcategory: "Mobile Recharge" },
  { keyword: "brother pocket", category: "Family & Children", subcategory: "Pocket Money" },
  { keyword: "pocket money", category: "Family & Children", subcategory: "Pocket Money" },
  { keyword: "digital gold", category: "Investments & Savings", subcategory: "Digital Gold" },
  { keyword: "cool drinks", category: "Food & Groceries", subcategory: "Beverages / Cool Drinks" },
  { keyword: "edible oil", category: "Food & Groceries", subcategory: "Edible Oils" },
  { keyword: "school fees", category: "Education", subcategory: "School Fees" },
  { keyword: "college fees", category: "Education", subcategory: "College Fees" },
  { keyword: "home loan", category: "Finance, Loans & Insurance", subcategory: "Home Loan EMI" },
  { keyword: "vehicle loan", category: "Finance, Loans & Insurance", subcategory: "Vehicle Loan EMI" },
  { keyword: "account transfer", category: "Miscellaneous", subcategory: "Transfer" },
  { keyword: "brother related", category: "Family & Children", subcategory: "Brother / Sister" },
  { keyword: "mother related", category: "Family & Children", subcategory: "Mother" },
  { keyword: "family support", category: "Family & Children", subcategory: "Family Support" },
  { keyword: "car service", category: "Transport & Vehicles", subcategory: "Vehicle Service" },
  { keyword: "silverbees", category: "Investments & Savings", subcategory: "Silver" },
  { keyword: "goldbees", category: "Investments & Savings", subcategory: "Gold" },
  { keyword: "chatgpt", category: "Bills & Communication", subcategory: "AI Tools" },
  { keyword: "claude", category: "Bills & Communication", subcategory: "AI Tools" },
  { keyword: "cursor", category: "Bills & Communication", subcategory: "AI Tools" },
  { keyword: "gemini", category: "Bills & Communication", subcategory: "AI Tools" },
  { keyword: "netflix", category: "Entertainment & Hobbies", subcategory: "OTT" },
  { keyword: "hotstar", category: "Entertainment & Hobbies", subcategory: "OTT" },
  { keyword: "spotify", category: "Entertainment & Hobbies", subcategory: "Music" },
  { keyword: "bitcoin", category: "Investments & Savings", subcategory: "Crypto" },
  { keyword: "fastag recharge", category: "Transport & Vehicles", subcategory: "Toll / FASTag" },
  { keyword: "fastag", category: "Transport & Vehicles", subcategory: "Toll / FASTag" },
  { keyword: "fas tag", category: "Transport & Vehicles", subcategory: "Toll / FASTag" },
  { keyword: "pharmacy", category: "Health & Medical", subcategory: "Pharmacy" },
  { keyword: "medicine", category: "Health & Medical", subcategory: "Medicines" },
  { keyword: "medicines", category: "Health & Medical", subcategory: "Medicines" },
  { keyword: "hospital", category: "Health & Medical", subcategory: "Hospital" },
  { keyword: "protein", category: "Health & Medical", subcategory: "Supplements / Nutrition" },
  { keyword: "insurance", category: "Finance, Loans & Insurance", subcategory: "Other Insurance" },
  { keyword: "petrol", category: "Transport & Vehicles", subcategory: "Petrol" },
  { keyword: "diesel", category: "Transport & Vehicles", subcategory: "Diesel" },
  { keyword: "paneer", category: "Food & Groceries", subcategory: "Milk & Dairy" },
  { keyword: "kirana", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { keyword: "chicken", category: "Food & Groceries", subcategory: "Meat & Chicken" },
  { keyword: "grocery", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { keyword: "groceries", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { keyword: "sabzi", category: "Food & Groceries", subcategory: "Vegetables" },
  { keyword: "vegetables", category: "Food & Groceries", subcategory: "Vegetables" },
  { keyword: "doodh", category: "Food & Groceries", subcategory: "Milk & Dairy" },
  { keyword: "dahi", category: "Food & Groceries", subcategory: "Milk & Dairy" },
  { keyword: "curd", category: "Food & Groceries", subcategory: "Milk & Dairy" },
  { keyword: "tiffin", category: "Food & Groceries", subcategory: "Tiffin / Meals" },
  { keyword: "atta", category: "Food & Groceries", subcategory: "Rice, Atta & Grains" },
  { keyword: "masala", category: "Food & Groceries", subcategory: "Spices & Masalas" },
  { keyword: "bijli", category: "Home & Household", subcategory: "Electricity" },
  { keyword: "electricity", category: "Home & Household", subcategory: "Electricity" },
  { keyword: "recharge", category: "Bills & Communication", subcategory: "Mobile Recharge" },
  { keyword: "cylinder", category: "Home & Household", subcategory: "Cooking Gas / LPG" },
  { keyword: "lpg", category: "Home & Household", subcategory: "Cooking Gas / LPG" },
  { keyword: "png", category: "Home & Household", subcategory: "PNG / Piped Gas" },
  { keyword: "maid", category: "Home & Household", subcategory: "Maid" },
  { keyword: "mandir", category: "Gifts, Donations & Social", subcategory: "Temple" },
  { keyword: "pooja", category: "Gifts, Donations & Social", subcategory: "Temple" },
  { keyword: "temple", category: "Gifts, Donations & Social", subcategory: "Temple" },
  { keyword: "diwali", category: "Gifts, Donations & Social", subcategory: "Festival Gifts" },
  { keyword: "tuition", category: "Education", subcategory: "Tuition" },
  { keyword: "coaching", category: "Education", subcategory: "Coaching" },
  { keyword: "mother", category: "Family & Children", subcategory: "Mother" },
  { keyword: "brother", category: "Family & Children", subcategory: "Brother / Sister" },
  { keyword: "father", category: "Family & Children", subcategory: "Father" },
  { keyword: "sister", category: "Family & Children", subcategory: "Brother / Sister" },
  { keyword: "rent", category: "Home & Household", subcategory: "Rent" },
  { keyword: "society", category: "Home & Household", subcategory: "Society / Maintenance" },
  { keyword: "eggs", category: "Food & Groceries", subcategory: "Eggs" },
  { keyword: "zomato", category: "Food & Groceries", subcategory: "Food Delivery" },
  { keyword: "swiggy", category: "Food & Groceries", subcategory: "Food Delivery" },
  { keyword: "blinkit", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { keyword: "zepto", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { keyword: "uber", category: "Transport & Vehicles", subcategory: "Cab / Taxi" },
  { keyword: "ola", category: "Transport & Vehicles", subcategory: "Cab / Taxi" },
  { keyword: "rapido", category: "Transport & Vehicles", subcategory: "Rapido / Ride Hailing" },
  { keyword: "irctc", category: "Transport & Vehicles", subcategory: "Train" },
  { keyword: "metro", category: "Transport & Vehicles", subcategory: "Metro" },
  { keyword: "gym", category: "Health & Medical", subcategory: "Gym Membership" },
  { keyword: "sip", category: "Investments & Savings", subcategory: "SIP" },
  { keyword: "nps", category: "Investments & Savings", subcategory: "NPS" },
  { keyword: "ppf", category: "Investments & Savings", subcategory: "PPF" },
  { keyword: "dal", category: "Food & Groceries", subcategory: "Pulses & Lentils" },
];

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
  ["Housing", "Rent", "Home", "Rent"],
  ["Housing", "House Maintenance", "Home", "Society Maintenance"],
  ["Housing", "Furniture", "Home", "Repairs & Furniture"],
  ["Housing", "Appliances", "Home", "Repairs & Furniture"],
  ["Housing", "Utilities", "Home", "Electricity"],
  ["Housing", "Society Charges", "Home", "Society Maintenance"],
  ["Housing", "Other Housing", "Home", "Other Home"],
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
  ["Fitness & Nutrition", "Gym Membership", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Protein", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Supplements", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Healthy Food", "Food", "Other Food"],
  ["Fitness & Nutrition", "Sports Equipment", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Personal Training", "Health", "Gym / Fitness"],
  ["Fitness & Nutrition", "Other Fitness", "Health", "Gym / Fitness"],
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
  ["Family", "Mother", "Family", "Family Support"],
  ["Family", "Father", "Family", "Family Support"],
  ["Family", "Brother", "Family", "Family Support"],
  ["Family", "Sister", "Family", "Family Support"],
  ["Family", "Children", "Family", "Kids"],
  ["Family", "Relatives", "Family", "Family Support"],
  ["Family", "Gifts", "Family", "Gifts"],
  ["Family", "Family Support", "Family", "Family Support"],
  ["Family", "Other Family", "Family", "Other Family"],
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
  ["Finance", "EMI", "Savings & EMI", "EMI"],
  ["Finance", "Credit Card Payment", "Savings & EMI", "Other"],
  ["Finance", "Loan Payment", "Savings & EMI", "EMI"],
  ["Finance", "Insurance", "Savings & EMI", "Insurance"],
  ["Finance", "Taxes", "Savings & EMI", "Bank Charges / Tax"],
  ["Finance", "Bank Charges", "Savings & EMI", "Bank Charges / Tax"],
  ["Finance", "Investment Transfer", "Savings & EMI", "SIP / Mutual Funds"],
  ["Finance", "Savings", "Savings & EMI", "Other"],
  ["Finance", "Other Finance", "Savings & EMI", "Other"],
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
  ["Shopping", "Clothing", "Shopping", "Clothes & Footwear"],
  ["Shopping", "Footwear", "Shopping", "Clothes & Footwear"],
  ["Shopping", "Accessories", "Shopping", "Other Shopping"],
  ["Shopping", "Electronics", "Shopping", "Electronics"],
  ["Shopping", "Home Items", "Home", "Repairs & Furniture"],
  ["Shopping", "Furniture", "Home", "Repairs & Furniture"],
  ["Shopping", "Online Shopping", "Shopping", "Online Shopping"],
  ["Shopping", "Gifts", "Family", "Gifts"],
  ["Shopping", "Other Shopping", "Shopping", "Other Shopping"],
  ["Entertainment", "Movies", "Entertainment", "Movies / Events"],
  ["Entertainment", "OTT", "Entertainment", "OTT / Music"],
  ["Entertainment", "Music", "Entertainment", "OTT / Music"],
  ["Entertainment", "Games", "Entertainment", "Games / Hobbies"],
  ["Entertainment", "Books", "Education", "Courses / Books"],
  ["Entertainment", "Hobbies", "Entertainment", "Games / Hobbies"],
  ["Entertainment", "Events", "Entertainment", "Movies / Events"],
  ["Entertainment", "Subscriptions", "Entertainment", "OTT / Music"],
  ["Entertainment", "Other Entertainment", "Entertainment", "Other Entertainment"],
  ["Education", "Courses", "Education", "Courses / Books"],
  ["Education", "Books", "Education", "Courses / Books"],
  ["Education", "Certifications", "Education", "Courses / Books"],
  ["Education", "Exams", "Education", "School / College Fees"],
  ["Education", "College", "Education", "School / College Fees"],
  ["Education", "Stationery", "Education", "Other Education"],
  ["Education", "Other Education", "Education", "Other Education"],
  ["Work", "Office Expenses", "Other", "Miscellaneous"],
  ["Work", "Software", "Bills", "Other Bills"],
  ["Work", "Travel", "Travel", "Other Travel"],
  ["Work", "Client Meeting", "Other", "Miscellaneous"],
  ["Work", "Business Meals", "Food", "Eating Out"],
  ["Work", "Equipment", "Shopping", "Electronics"],
  ["Work", "Other Work", "Other", "Miscellaneous"],
  ["Bills", "Electricity", "Home", "Electricity"],
  ["Bills", "Water", "Home", "Water"],
  ["Bills", "Gas", "Home", "Cooking Gas"],
  ["Bills", "Internet", "Bills", "WiFi / Broadband"],
  ["Bills", "Phone", "Bills", "Mobile Recharge"],
  ["Bills", "DTH", "Bills", "DTH"],
  ["Bills", "Subscriptions", "Entertainment", "OTT / Music"],
  ["Bills", "Other Bills", "Bills", "Other Bills"],
  ["Gifts & Donations", "Gift", "Family", "Gifts"],
  ["Gifts & Donations", "Donation", "Family", "Pooja / Temple"],
  ["Gifts & Donations", "Charity", "Family", "Pooja / Temple"],
  ["Gifts & Donations", "Festival", "Family", "Festival"],
  ["Gifts & Donations", "Birthday", "Family", "Gifts"],
  ["Gifts & Donations", "Wedding", "Family", "Festival"],
  ["Gifts & Donations", "Other Gifts", "Family", "Gifts"],
  ["Pets", "Food", "Other", "Miscellaneous"],
  ["Pets", "Vet", "Other", "Miscellaneous"],
  ["Pets", "Accessories", "Other", "Miscellaneous"],
  ["Pets", "Medicine", "Other", "Miscellaneous"],
  ["Pets", "Other Pets", "Other", "Miscellaneous"],
  ["Travel", "Hotels", "Travel", "Hotel / Stay"],
  ["Travel", "Flights", "Travel", "Flight"],
  ["Travel", "Train", "Travel", "Train"],
  ["Travel", "Bus", "Travel", "Metro / Bus"],
  ["Travel", "Food", "Food", "Eating Out"],
  ["Travel", "Shopping", "Shopping", "Other Shopping"],
  ["Travel", "Activities", "Entertainment", "Movies / Events"],
  ["Travel", "Visa", "Travel", "Other Travel"],
  ["Travel", "Other Travel", "Travel", "Other Travel"],
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

export const MIGRATION_NOTE_RULES: { match: RegExp; category: string; subcategory: string }[] = [
  { match: /chicken\s+for\s+diet/i, category: "Health & Medical", subcategory: "Supplements / Nutrition" },
  { match: /eggs\s+for\s+diet/i, category: "Health & Medical", subcategory: "Supplements / Nutrition" },
  {
    match: /\b(claude|cursor|chatgpt|gemini|openai|copilot)\b/i,
    category: "Bills & Communication",
    subcategory: "AI Tools",
  },
  {
    match: /\b(netflix|prime video|hotstar|disney\+|spotify)\b/i,
    category: "Entertainment & Hobbies",
    subcategory: "OTT",
  },
  { match: /brother\s*related|\bbrother\b/i, category: "Family & Children", subcategory: "Brother / Sister" },
  { match: /mother\s*related|\bmother\b/i, category: "Family & Children", subcategory: "Mother" },
  { match: /\bpetrol\b|\bfuel\b/i, category: "Transport & Vehicles", subcategory: "Petrol" },
  { match: /\bdiesel\b/i, category: "Transport & Vehicles", subcategory: "Diesel" },
  { match: /cool\s*drinks?|\bbeverage/i, category: "Food & Groceries", subcategory: "Beverages / Cool Drinks" },
  { match: /\bgrocer/i, category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { match: /\bhealth\b|\bmedicine/i, category: "Health & Medical", subcategory: "Medicines" },
];

const BALANCE_SHEET_NOTE =
  /\bcredit\s*card\s*(bill|payment)\b|\bcc\s*payment\b|\baccount\s*transfer\b|\bneft\b|\bimps\b|\brtgs\b/i;

export function isBalanceSheetMovementNote(note: string): boolean {
  return BALANCE_SHEET_NOTE.test(note);
}

export function suggestCategoryFromNote(note: string): CategoryPair | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;
  if (isBalanceSheetMovementNote(normalized)) return null;

  const sorted = [...CATEGORY_SUGGESTIONS].sort((a, b) => b.keyword.length - a.keyword.length);
  for (const item of sorted) {
    if (normalized.includes(item.keyword)) {
      return { category: item.category, subcategory: item.subcategory };
    }
  }
  return null;
}

function otherSubForV3(node: { subcategories: string[] }): string {
  return (
    node.subcategories.find((s) => s === "Other" || s.startsWith("Other")) ??
    node.subcategories[node.subcategories.length - 1] ??
    "Miscellaneous"
  );
}

function otherSubFor(node: TaxonomyNode): string {
  return (
    node.subcategories.find((s) => s.name === "Other" || s.name.startsWith("Other"))?.name ??
    node.subcategories[node.subcategories.length - 1]?.name ??
    "Uncategorized"
  );
}

function liftV3PairToV4(mapped: CategoryPair): CategoryPair {
  const exact = V3_TO_V4_MAP[pairKey(mapped.category, mapped.subcategory)];
  if (exact) return exact;
  const parent = V3_PARENT_TO_V4[mapped.category];
  if (parent) {
    const dest = CATEGORY_TAXONOMY.find((c) => c.name === parent.category);
    if (dest && dest.subcategories.some((s) => s.name === mapped.subcategory)) {
      return { category: parent.category, subcategory: mapped.subcategory };
    }
    return parent;
  }
  return mapped;
}

/**
 * Map a stored category/subcategory pair onto the v3 Indian taxonomy.
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

  const node = V3_CATEGORY_TAXONOMY.find((c) => c.name === parent);
  if (node) {
    if (sub && node.subcategories.includes(sub)) {
      return { category: parent, subcategory: sub };
    }
    return { category: parent, subcategory: otherSubForV3(node) };
  }

  const renamed = V1_PARENT_MAP[parent];
  if (renamed) return renamed;

  const legacy = LEGACY_CATEGORY_MAP[parent];
  if (legacy) return legacy;

  return null;
}

/**
 * Map a stored pair onto the current v4 taxonomy.
 * Returns null when the names look custom and should be left unchanged.
 */
export function mapToV4Category(
  category: string,
  subcategory?: string | null,
  note = ""
): CategoryPair | null {
  const parent = (category || "").trim();
  const sub = (subcategory || "").trim();
  if (!parent) return null;

  const current = CATEGORY_TAXONOMY.find((c) => c.name === parent);
  if (current) {
    if (sub && current.subcategories.some((s) => s.name === sub)) {
      return { category: parent, subcategory: sub };
    }
    if (sub) return { category: parent, subcategory: sub };
    return { category: parent, subcategory: otherSubFor(current) };
  }

  if (sub) {
    const v3Pair = V3_TO_V4_MAP[pairKey(parent, sub)];
    if (v3Pair) return v3Pair;
  }

  const v3Parent = V3_PARENT_TO_V4[parent];
  if (v3Parent) {
    const dest = CATEGORY_TAXONOMY.find((c) => c.name === v3Parent.category);
    if (sub && dest?.subcategories.some((s) => s.name === sub)) {
      return { category: v3Parent.category, subcategory: sub };
    }
    const hinted = suggestCategoryFromNote([parent, sub, note].filter(Boolean).join(" "));
    if (hinted) return hinted;
    if (sub) return { category: v3Parent.category, subcategory: sub };
    return v3Parent;
  }

  const v2 = mapToV2Category(parent, sub || undefined);
  if (v2) return liftV3PairToV4(v2);

  if (note) {
    const suggestion = suggestCategoryFromNote(note);
    if (suggestion) return suggestion;
  }

  return null;
}

export function collapseToCurrentTaxonomy(
  category: string,
  subcategory?: string | null,
  note = ""
): CategoryPair {
  const parent = (category || "").trim();
  const sub = (subcategory || "").trim();

  const mappedV4 = mapToV4Category(parent, sub, note);
  if (mappedV4 && isExactTaxonomyPair(mappedV4.category, mappedV4.subcategory)) {
    return mappedV4;
  }

  const blobs = [[parent, sub].filter(Boolean).join(" "), parent, sub, note];
  for (const blob of blobs) {
    const suggestion = suggestCategoryFromNote(blob);
    if (suggestion) return suggestion;
  }

  if (mappedV4) return mappedV4;

  const v2 = mapToV2Category(parent, sub || undefined);
  if (v2) return liftV3PairToV4(v2);

  const lower = parent.toLowerCase();
  for (const [legacyName, pairValue] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (legacyName.toLowerCase() === lower) return liftV3PairToV4(pairValue);
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

  const mapped = mapToV4Category(legacyCategory, undefined, note);
  if (mapped) return mapped;

  const v2 = mapToV2Category(legacyCategory, undefined);
  if (v2) return liftV3PairToV4(v2);

  return { category: "Miscellaneous", subcategory: "Uncategorized" };
}

export function getSubcategoriesFor(categoryName: string): string[] {
  const node = CATEGORY_TAXONOMY.find((c) => c.name === categoryName);
  return node ? subcategoryNamesOf(node) : [];
}

export function getCategoryIcon(categoryName: string): string {
  return CATEGORY_TAXONOMY.find((c) => c.name === categoryName)?.icon ?? "📦";
}

export function isCurrentParentCategory(name: string): boolean {
  return CURRENT_PARENTS.has(name);
}

export function isV3ParentCategory(name: string): boolean {
  return V3_PARENTS.has(name);
}

export function isHiddenTaxonomyParent(name: string): boolean {
  return HIDDEN_TAXONOMY_PARENT_NAMES.has(name);
}

export function categoryParentMatchesSearch(
  parentName: string,
  subcategoryNames: string[],
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (parentName.toLowerCase().includes(q)) return true;
  if (subcategoryNames.some((name) => name.toLowerCase().includes(q))) return true;
  return CATEGORY_SUGGESTIONS.some(
    (item) => item.category === parentName && item.keyword.includes(q)
  );
}

export function collectTaxonomyIntegrityIssues(): string[] {
  const issues: string[] = [];
  const parentKeys = new Set<string>();
  const parentNames = new Set<string>();
  for (const node of CATEGORY_TAXONOMY) {
    if (parentKeys.has(node.key)) issues.push(`duplicate parent key ${node.key}`);
    parentKeys.add(node.key);
    if (parentNames.has(node.name)) issues.push(`duplicate parent name ${node.name}`);
    parentNames.add(node.name);
    const subKeys = new Set<string>();
    const subNames = new Set<string>();
    for (const item of node.subcategories) {
      if (subKeys.has(item.key)) issues.push(`duplicate sub key ${node.key}/${item.key}`);
      subKeys.add(item.key);
      if (subNames.has(item.name)) issues.push(`duplicate sub name ${node.name}/${item.name}`);
      subNames.add(item.name);
    }
  }
  return issues;
}
