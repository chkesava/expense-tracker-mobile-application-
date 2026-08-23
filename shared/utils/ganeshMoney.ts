import { formatAmount, formatAmountNumber } from "./formatCurrency";

const INR = "INR";
const LAKHS = { numberFormatStyle: "lakhs" as const };

/** Festival hisab is always Indian Rupees, independent of personal settings. */
export function formatInr(value: number): string {
  return formatAmount(value, INR, LAKHS);
}

export function formatInrNumber(value: number): string {
  return formatAmountNumber(value, INR, LAKHS);
}
