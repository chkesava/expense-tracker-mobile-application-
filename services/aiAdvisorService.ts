import type { Expense, Income } from "@/shared/types/expense";
import { groupByCategory } from "@/shared/utils/analytics";
import { answerAdvisorQuery } from "@/shared/utils/advisorQueries";
import { currentMonthKey } from "@/shared/utils/dates";
import { getSmartInsight } from "@/shared/utils/insights";
import {
  getAnomalies,
  getTopVendors,
  getWeekendVsWeekdaySplit,
} from "@/shared/utils/rangeAnalytics";

export interface AdvisorContext {
  currency: string;
  currentMonth: string;
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  pacingPercentage: number;
  projectedExpense: number;
  smartInsight: {
    title: string;
    description: string;
    type: "positive" | "warning" | "neutral";
  };
  topCategories: Array<{ category: string; amount: number; percentage: number }>;
  topVendors: Array<{ vendor: string; count: number; total: number }>;
  weekendSpendPct: number;
  anomaliesCount: number;
  foodSpend: number;
  monthlyBudget: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  highlightCard?: {
    title: string;
    value: string;
    type?: "positive" | "warning" | "neutral";
  };
  quickActions?: string[];
}

/**
 * Builds analytical financial context from user's current transactions
 */
export function buildAdvisorContext(
  expenses: Expense[],
  incomes: Income[],
  currency: string = "INR",
  monthlyBudget = 0
): AdvisorContext {
  const currentMonth = currentMonthKey();

  const monthExpenses = expenses.filter(
    (e) => e.month === currentMonth || e.date?.startsWith(currentMonth)
  );
  const monthIncomes = incomes.filter((inc) => inc.date?.startsWith(currentMonth));

  const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalIncome = monthIncomes.reduce((sum, inc) => sum + inc.amount, 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate =
    totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

  // Run-rate projection calculation
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAverage = dayOfMonth > 0 ? totalExpenses / dayOfMonth : 0;
  const projectedExpense = Math.round(dailyAverage * daysInCurrentMonth);
  const expectedPacingBaseline = totalIncome > 0 ? totalIncome : (totalExpenses * 1.1 || 1000);
  const pacingPercentage = expectedPacingBaseline > 0 ? Math.round((projectedExpense / expectedPacingBaseline) * 100) : 100;

  const rawInsight = getSmartInsight(monthExpenses, totalIncome, currentMonth);
  const smartInsight: {
    title: string;
    description: string;
    type: "positive" | "warning" | "neutral";
  } = {
    title: totalExpenses > totalIncome && totalIncome > 0 ? "Budget Deficit Warning" : "Healthy Trajectory",
    description: rawInsight.message,
    type: rawInsight.type === "danger" ? "warning" : rawInsight.type === "success" ? "positive" : "neutral",
  };

  const grouped = groupByCategory(monthExpenses).sort((a, b) => b.value - a.value);
  const topCategories = grouped.slice(0, 4).map((item) => ({
    category: item.category,
    amount: item.value,
    percentage:
      totalExpenses > 0 ? Math.round((item.value / totalExpenses) * 100) : 0,
  }));

  const rawVendors = getTopVendors(monthExpenses).slice(0, 3);
  const topVendors = rawVendors.map((v) => ({
    vendor: v.note,
    count: v.count,
    total: v.total,
  }));

  const split = getWeekendVsWeekdaySplit(monthExpenses);
  const totalWeekendWeekday = split.weekend + split.weekday;
  const weekendSpendPct =
    totalWeekendWeekday > 0 ? Math.round((split.weekend / totalWeekendWeekday) * 100) : 0;

  const anomalies = getAnomalies(monthExpenses);
  const foodSpend = monthExpenses
    .filter((e) => (e.category || "").toLowerCase().startsWith("food"))
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    currency,
    currentMonth,
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    pacingPercentage,
    projectedExpense,
    smartInsight,
    topCategories,
    topVendors,
    weekendSpendPct,
    anomaliesCount: anomalies.length,
    foodSpend,
    monthlyBudget,
  };
}

/**
 * Intelligent on-device financial advisor assistant
 */
export async function generateAdvisorResponse(
  userQuery: string,
  context: AdvisorContext,
  history: ChatMessage[] = []
): Promise<ChatMessage> {
  const query = userQuery.trim().toLowerCase();
  const timestamp = Date.now();
  const id = `msg_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;

  const direct = answerAdvisorQuery(userQuery, {
    currency: context.currency === "INR" ? "₹" : context.currency,
    currentMonth: context.currentMonth,
    foodSpend: context.foodSpend,
    topCategory: context.topCategories[0],
    monthlyBudget: context.monthlyBudget,
    monthSpent: context.totalExpenses,
    netSavings: context.netSavings,
  });
  if (direct) {
    return {
      id,
      role: "assistant",
      content: direct,
      timestamp,
      quickActions: [
        "How much did I spend on food this month?",
        "Where am I spending the most?",
        "Can I spend ₹3,000 this weekend?",
      ],
    };
  }

  // 1. Spending Overview / Month Health
  if (
    query.includes("analyze") ||
    query.includes("spending") ||
    query.includes("health") ||
    query.includes("summary") ||
    query.includes("how am i doing")
  ) {
    const isPacingOver = context.pacingPercentage > 100;
    const topCat = context.topCategories[0];

    const content =
      `Here is your **${context.currentMonth} Financial Snapshot**:\n\n` +
      `• **Total Outflow**: ${context.currency} ${context.totalExpenses.toLocaleString()}\n` +
      `• **Total Inflow**: ${context.currency} ${context.totalIncome.toLocaleString()}\n` +
      `• **Net Savings**: ${context.currency} ${context.netSavings.toLocaleString()} (${context.savingsRate}% savings rate)\n\n` +
      `**Pacing Status**: You are currently spending at **${context.pacingPercentage}%** of your expected daily run-rate. ` +
      (isPacingOver
        ? `⚠️ At this rate, your projected end-of-month spend is ${context.currency} ${context.projectedExpense.toLocaleString()}.`
        : `✅ You are well within a healthy monthly trajectory.`) +
      (topCat ? `\n\nYour largest expense driver is **${topCat.category}** accounting for **${topCat.percentage}%** of total expenses.` : "");

    return {
      id,
      role: "assistant",
      content,
      timestamp,
      highlightCard: {
        title: "Net Savings",
        value: `${context.currency} ${context.netSavings.toLocaleString()}`,
        type: context.netSavings >= 0 ? "positive" : "warning",
      },
      quickActions: ["Find savings opportunities", "Top categories", "Budget advice"],
    };
  }

  // 2. Savings & Optimization Tips
  if (
    query.includes("saving") ||
    query.includes("save money") ||
    query.includes("cut cost") ||
    query.includes("opportunities") ||
    query.includes("reduce")
  ) {
    const topCat = context.topCategories[0];
    const secondCat = context.topCategories[1];

    let content = `💡 **Actionable Savings Recommendations**:\n\n`;

    if (topCat) {
      const tenPct = Math.round(topCat.amount * 0.15);
      content += `1. **Target ${topCat.category}**: Trimming just 15% from this category will save you **${context.currency} ${tenPct.toLocaleString()}** this month.\n`;
    }

    if (context.weekendSpendPct > 40) {
      content += `2. **Weekend Outings**: ${context.weekendSpendPct}% of your spending occurs on weekends. Setting a dedicated weekend entertainment envelope will significantly reduce unplanned leaks.\n`;
    }

    if (context.topVendors.length > 0) {
      const topV = context.topVendors[0];
      content += `3. **Frequent Vendor**: You transacted with **${topV.vendor}** ${topV.count} times (${context.currency} ${topV.total.toLocaleString()}). Look for bundled passes, subscriptions or loyalty discounts.\n`;
    }

    content += `\nWould you like me to analyze your recurring subscriptions or category limits?`;

    return {
      id,
      role: "assistant",
      content,
      timestamp,
      highlightCard: {
        title: "Potential Monthly Savings",
        value: `${context.currency} ${Math.round(context.totalExpenses * 0.12).toLocaleString()}`,
        type: "positive",
      },
      quickActions: ["Top categories", "Analyze subscriptions", "Check weekend split"],
    };
  }

  // 3. Category Breakdown Query
  if (
    query.includes("category") ||
    query.includes("categories") ||
    query.includes("where did my money go") ||
    query.includes("breakdown")
  ) {
    let content = `📊 **Top Spending Categories for ${context.currentMonth}**:\n\n`;
    if (context.topCategories.length === 0) {
      content += `No expense transactions recorded yet for this month.`;
    } else {
      context.topCategories.forEach((cat, idx) => {
        content += `${idx + 1}. **${cat.category}**: ${context.currency} ${cat.amount.toLocaleString()} (${cat.percentage}%)\n`;
      });
    }

    return {
      id,
      role: "assistant",
      content,
      timestamp,
      quickActions: ["How to save on " + (context.topCategories[0]?.category || "food"), "Monthly summary"],
    };
  }

  // 4. Affordability / Purchase Check
  const affordMatch = query.match(/(?:can i afford|can i buy|should i buy|afford)\s*(?:a|an)?\s*([a-zA-Z\s]+)?\s*(?:for|costing|worth)?\s*(?:rs\.?|₹|\$)?\s*(\d+(?:\.\d+)?)/i);
  if (affordMatch) {
    const item = affordMatch[1]?.trim() || "item";
    const cost = parseFloat(affordMatch[2]);

    if (!isNaN(cost) && cost > 0) {
      const remainingSavings = context.netSavings - cost;
      const canAfford = remainingSavings >= 0;

      const content =
        canAfford
          ? `✅ **Purchase Feasibility**: You can comfortably afford this ${item} (${context.currency} ${cost.toLocaleString()}).\n\n` +
            `• Current Net Savings: ${context.currency} ${context.netSavings.toLocaleString()}\n` +
            `• Savings remaining after purchase: ${context.currency} ${remainingSavings.toLocaleString()}\n\n` +
            `Your budget remains in the positive green zone.`
          : `⚠️ **Caution**: Spending ${context.currency} ${cost.toLocaleString()} for ${item} would exceed your current net cashflow by **${context.currency} ${Math.abs(remainingSavings).toLocaleString()}**.\n\n` +
            `Consider postponing to next month or financing it from a dedicated goal fund.`;

      return {
        id,
        role: "assistant",
        content,
        timestamp,
        highlightCard: {
          title: "Feasibility Score",
          value: canAfford ? "Affordable" : "Exceeds Margin",
          type: canAfford ? "positive" : "warning",
        },
        quickActions: ["Find savings opportunities", "Monthly summary"],
      };
    }
  }

  // 5. Default General Advisor Response
  const content =
    `I am your **AI Financial Advisor**. Based on your **${context.currentMonth}** records:\n\n` +
    `• You have recorded **${context.currency} ${context.totalExpenses.toLocaleString()}** in expenses and **${context.currency} ${context.totalIncome.toLocaleString()}** in income.\n` +
    `• Status: ${context.smartInsight.title} — ${context.smartInsight.description}\n\n` +
    `You can ask me questions like:\n` +
    `• *"Analyze my monthly spending"*\n` +
    `• *"Where can I cut costs this month?"*\n` +
    `• *"Can I afford a 4500 purchase?"*\n` +
    `• *"Show my top spending categories"*`;

  return {
    id,
    role: "assistant",
    content,
    timestamp,
    quickActions: ["Analyze spending", "Find savings opportunities", "Top categories"],
  };
}
