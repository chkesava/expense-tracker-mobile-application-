import {
  Baby,
  Briefcase,
  Car,
  Clapperboard,
  CreditCard,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Package,
  PawPrint,
  Plane,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TrendingUp,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";

/**
 * SPENDLY-574 — line icons for the default parent categories (the taxonomy's
 * emoji read as clip-art next to the app's lucide icons). Custom or legacy
 * names fall back to a keyword match, then a neutral package.
 */
const BY_NAME: Record<string, LucideIcon> = {
  "Food & Groceries": Utensils,
  "Home & Household": House,
  "Transport & Vehicles": Car,
  "Bills & Communication": Smartphone,
  "Shopping & Clothing": ShoppingBag,
  "Health & Medical": HeartPulse,
  Education: GraduationCap,
  "Family & Children": Baby,
  "Personal Care": Sparkles,
  "Entertainment & Hobbies": Clapperboard,
  "Travel & Holidays": Plane,
  "Finance, Loans & Insurance": CreditCard,
  "Investments & Savings": TrendingUp,
  "Gifts, Donations & Social": Gift,
  Pets: PawPrint,
  "Work & Professional": Briefcase,
  "Government, Legal & Documents": Landmark,
  Miscellaneous: Package,
  Income: Wallet,
};

const KEYWORDS: Array<[RegExp, LucideIcon]> = [
  [/food|grocer|dining|restaurant|meal/i, Utensils],
  [/home|house|rent|household/i, House],
  [/transport|vehicle|fuel|petrol|car|cab/i, Car],
  [/bill|phone|mobile|internet|utilit/i, Smartphone],
  [/shop|cloth/i, ShoppingBag],
  [/health|medic|doctor/i, HeartPulse],
  [/educat|school|course/i, GraduationCap],
  [/travel|holiday|flight/i, Plane],
  [/entertain|movie|hobb/i, Clapperboard],
  [/loan|insur|finance|card|emi/i, CreditCard],
  [/invest|saving/i, TrendingUp],
  [/gift|donat/i, Gift],
  [/pet/i, PawPrint],
  [/work|office|profession/i, Briefcase],
];

export function categoryLucideIcon(category: string): LucideIcon {
  return BY_NAME[category] ?? KEYWORDS.find(([pattern]) => pattern.test(category))?.[1] ?? Package;
}
