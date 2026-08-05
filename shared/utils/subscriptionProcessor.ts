import type { Subscription } from "@/shared/types/subscription";
import type { Expense, AccountTransfer } from "@/shared/types/expense";

export interface DueEvaluationResult {
  isDue: boolean;
  isCompleted: boolean;
  targetDateStr: string;
  monthKey: string;
}

/**
 * Checks if an EMI has reached its end term.
 */
export function isEmiTermCompleted(
  sub: Subscription,
  year: number,
  month: number
): boolean {
  if (!sub.endYear || !sub.endMonth) return false;
  if (year > sub.endYear) return true;
  if (year === sub.endYear && month > sub.endMonth) return true;
  return false;
}

/**
 * Evaluates whether a subscription is currently due for posting in the given evaluation date.
 */
export function evaluateSubscriptionDue(
  sub: Subscription,
  evaluationDate = new Date()
): DueEvaluationResult {
  const year = evaluationDate.getFullYear();
  const month = evaluationDate.getMonth() + 1;
  const day = evaluationDate.getDate();

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // If inactive or already marked completed, not due
  if (!sub.isActive || sub.isCompleted) {
    return { isDue: false, isCompleted: !!sub.isCompleted, targetDateStr: "", monthKey };
  }

  // If already processed for this month, not due
  if (sub.lastProcessed === monthKey) {
    return { isDue: false, isCompleted: false, targetDateStr: "", monthKey };
  }

  // Check if past its final EMI month/year
  if (isEmiTermCompleted(sub, year, month)) {
    return { isDue: false, isCompleted: true, targetDateStr: "", monthKey };
  }

  // Determine effective day for the month (clamped to number of days in current month)
  const daysInMonth = new Date(year, month, 0).getDate();
  const effectiveDay = Math.min(Math.max(1, sub.dayOfMonth || 1), daysInMonth);

  // If current day has reached or passed effectiveDay, it is due
  const isDue = day >= effectiveDay;
  const targetDateStr = `${monthKey}-${String(effectiveDay).padStart(2, "0")}`;

  // Check if this month is the exact final term for an EMI
  const willCompleteAfterThis =
    sub.type === "emi" &&
    sub.endYear === year &&
    sub.endMonth === month;

  return {
    isDue,
    isCompleted: willCompleteAfterThis,
    targetDateStr,
    monthKey,
  };
}

/**
 * Builds an Expense object payload from a due Subscription.
 */
export function buildExpenseFromSubscription(
  sub: Subscription,
  dateStr: string,
  monthKey: string
): Omit<Expense, "id"> {
  const prefix = sub.type === "emi" ? "[EMI]" : "[Subscription]";
  return {
    amount: sub.amount,
    category: sub.category || (sub.type === "emi" ? "EMIs & Loans" : "Subscriptions"),
    subcategory: sub.type === "emi" ? "EMI" : "Subscriptions",
    note: `${prefix} ${sub.name}`,
    date: dateStr,
    month: monthKey,
    accountId: sub.accountId || undefined,
    subscriptionId: sub.id,
    isRecurring: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Builds an AccountTransfer object payload from a due recurring Transfer.
 */
export function buildTransferFromSubscription(
  sub: Subscription,
  dateStr: string
): Omit<AccountTransfer, "id"> {
  return {
    fromAccountId: sub.accountId || "",
    toAccountId: sub.toAccountId || "",
    amount: sub.amount,
    date: dateStr,
    note: `[Auto-Transfer] ${sub.name}`,
  };
}

/**
 * Computes the next scheduled payment date and countdown days for a subscription.
 */
export function getNextRenewalDate(
  sub: Subscription,
  fromDate = new Date()
): { dateStr: string; daysRemaining: number } {
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth() + 1;
  const day = fromDate.getDate();

  const daysInCurrentMonth = new Date(year, month, 0).getDate();
  const targetDay = Math.min(Math.max(1, sub.dayOfMonth || 1), daysInCurrentMonth);

  let nextYear = year;
  let nextMonth = month;
  let nextDay = targetDay;

  if (day > targetDay || sub.lastProcessed === `${year}-${String(month).padStart(2, "0")}`) {
    // Moves to next month
    if (month === 12) {
      nextYear = year + 1;
      nextMonth = 1;
    } else {
      nextMonth = month + 1;
    }
    const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
    nextDay = Math.min(Math.max(1, sub.dayOfMonth || 1), daysInNextMonth);
  }

  const nextDateStr = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(
    nextDay
  ).padStart(2, "0")}`;

  const targetDateObj = new Date(nextYear, nextMonth - 1, nextDay);
  const diffTime = targetDateObj.getTime() - new Date(year, month - 1, day).getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  return { dateStr: nextDateStr, daysRemaining };
}

export interface MonthlyCommitmentSummary {
  totalMonthly: number;
  activeCount: number;
  completedCount: number;
  subscriptionsTotal: number;
  emisTotal: number;
  transfersTotal: number;
}

/**
 * Computes overall monthly commitments across active subscriptions and EMIs.
 */
export function computeMonthlyCommitments(
  subscriptions: Subscription[]
): MonthlyCommitmentSummary {
  let totalMonthly = 0;
  let activeCount = 0;
  let completedCount = 0;
  let subscriptionsTotal = 0;
  let emisTotal = 0;
  let transfersTotal = 0;

  for (const sub of subscriptions) {
    if (sub.isCompleted) {
      completedCount++;
      continue;
    }

    if (sub.isActive) {
      activeCount++;
      const amount = sub.amount || 0;
      totalMonthly += amount;

      if (sub.type === "emi") {
        emisTotal += amount;
      } else if (sub.type === "transfer") {
        transfersTotal += amount;
      } else {
        subscriptionsTotal += amount;
      }
    }
  }

  return {
    totalMonthly,
    activeCount,
    completedCount,
    subscriptionsTotal,
    emisTotal,
    transfersTotal,
  };
}
