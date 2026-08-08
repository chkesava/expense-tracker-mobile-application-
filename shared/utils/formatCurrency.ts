export type CurrencyOption = {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  locale: string;
};

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", flag: "🇮🇳", locale: "en-IN" },
  { code: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", locale: "en-US" },
  { code: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", locale: "en-IE" },
  { code: "GBP", symbol: "£", name: "British Pound", flag: "🇬🇧", locale: "en-GB" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵", locale: "ja-JP" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", flag: "🇨🇦", locale: "en-CA" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", flag: "🇦🇺", locale: "en-AU" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", flag: "🇸🇬", locale: "en-SG" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", flag: "🇦🇪", locale: "ar-AE" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", flag: "🇨🇭", locale: "de-CH" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", flag: "🇧🇷", locale: "pt-BR" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", flag: "🇨🇳", locale: "zh-CN" },
];

const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c.symbol])
);

const CURRENCY_LOCALES: Record<string, string> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c.locale])
);

export function currencySymbol(currencyCode = "INR"): string {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

export function currencyLocale(currencyCode = "INR"): string {
  return CURRENCY_LOCALES[currencyCode] || "en-IN";
}

export type NumberFormatStyle = "auto" | "standard" | "lakhs";

export type FormatAmountOptions = {
  /** Override Intl locale. Defaults from currency code. */
  locale?: string;
  /** Force fraction digits. Defaults: 0 for integers, up to 2 otherwise. */
  fractionDigits?: number;
  /** When true, always show 2 decimal places. */
  fixedDecimals?: boolean;
  /** Number format grouping style */
  numberFormatStyle?: NumberFormatStyle;
};

/** Shared number formatting for financial values (no currency symbol). */
export function formatAmountNumber(
  value: number,
  currencyCode = "INR",
  options: FormatAmountOptions = {}
): string {
  let locale = options.locale ?? currencyLocale(currencyCode);
  if (options.numberFormatStyle === "standard") {
    locale = "en-US";
  } else if (options.numberFormatStyle === "lakhs") {
    locale = "en-IN";
  }

  const isInt = Number.isInteger(value);
  const maximumFractionDigits =
    options.fractionDigits ?? (options.fixedDecimals ? 2 : isInt ? 0 : 2);
  const minimumFractionDigits =
    options.fractionDigits ?? (options.fixedDecimals ? 2 : 0);

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

/** Currency symbol + formatted number (Amount / NumberTicker shared path). */
export function formatAmount(
  value: number,
  currencyCode = "INR",
  options: FormatAmountOptions & { prefix?: string } = {}
): string {
  const prefix =
    options.prefix !== undefined ? options.prefix : currencySymbol(currencyCode);
  return `${prefix}${formatAmountNumber(value, currencyCode, options)}`;
}

