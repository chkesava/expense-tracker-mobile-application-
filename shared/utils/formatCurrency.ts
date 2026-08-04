const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "د.إ",
};

const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  JPY: "ja-JP",
  AUD: "en-AU",
  CAD: "en-CA",
  SGD: "en-SG",
  AED: "ar-AE",
};

export function currencySymbol(currencyCode = "INR"): string {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

export function currencyLocale(currencyCode = "INR"): string {
  return CURRENCY_LOCALES[currencyCode] || "en-IN";
}

export type FormatAmountOptions = {
  /** Override Intl locale. Defaults from currency code. */
  locale?: string;
  /** Force fraction digits. Defaults: 0 for integers, up to 2 otherwise. */
  fractionDigits?: number;
  /** When true, always show 2 decimal places. */
  fixedDecimals?: boolean;
};

/** Shared number formatting for financial values (no currency symbol). */
export function formatAmountNumber(
  value: number,
  currencyCode = "INR",
  options: FormatAmountOptions = {}
): string {
  const locale = options.locale ?? currencyLocale(currencyCode);
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
