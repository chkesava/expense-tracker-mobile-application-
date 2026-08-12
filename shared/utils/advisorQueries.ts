/**
 * On-device advisor answers for common spend questions.
 * Uses ledger totals only — never raw SMS.
 */

export type AdvisorQueryIntent =
  | "food_month"
  | "top_spend"
  | "weekend_spend"
  | "unknown";

export type AdvisorQueryContext = {
  currency: string;
  currentMonth: string;
  foodSpend: number;
  topCategory?: { category: string; amount: number; percentage: number };
  monthlyBudget: number;
  monthSpent: number;
  netSavings: number;
};

const FOOD_RE =
  /how much.*food|spent on food|food (?:this )?month|food spending/i;
const TOP_RE =
  /where am i spending|spending the most|biggest category|top (?:spend|category)/i;
const WEEKEND_RE =
  /(?:can i spend|afford).*(?:weekend)|this weekend/i;

export function matchAdvisorQueryIntent(query: string): AdvisorQueryIntent {
  const text = query.trim();
  if (FOOD_RE.test(text)) return "food_month";
  if (TOP_RE.test(text)) return "top_spend";
  if (WEEKEND_RE.test(text)) return "weekend_spend";
  return "unknown";
}

export function parseSpendAmount(query: string): number | undefined {
  const match = query.match(
    /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (!match?.[1]) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function answerAdvisorQuery(
  query: string,
  context: AdvisorQueryContext
): string | null {
  const intent = matchAdvisorQueryIntent(query);
  const money = (value: number) =>
    `${context.currency} ${Math.round(value).toLocaleString("en-IN")}`;

  if (intent === "food_month") {
    return (
      `🍽️ You spent **${money(context.foodSpend)}** on food this month (${context.currentMonth}).`
    );
  }

  if (intent === "top_spend") {
    const top = context.topCategory;
    if (!top) {
      return "No expenses recorded this month yet, so I cannot tell where you are spending the most.";
    }
    return (
      `📊 You are spending the most on **${top.category}** — ` +
      `**${money(top.amount)}** (${top.percentage}% of this month).`
    );
  }

  if (intent === "weekend_spend") {
    const amount = parseSpendAmount(query) ?? 0;
    if (amount <= 0) {
      return "Tell me an amount, for example: Can I spend ₹3,000 this weekend?";
    }
    const remaining =
      context.monthlyBudget > 0
        ? context.monthlyBudget - context.monthSpent
        : context.netSavings;
    const can = remaining >= amount;
    const head = can
      ? `✅ Yes — ₹${amount.toLocaleString("en-IN")} this weekend fits.`
      : `⚠️ ₹${amount.toLocaleString("en-IN")} this weekend would stretch this month.`;
    const basis =
      context.monthlyBudget > 0
        ? `Monthly budget remaining: **${money(remaining)}**.`
        : `Net savings this month: **${money(remaining)}**.`;
    return `${head}\n\n${basis}`;
  }

  return null;
}
