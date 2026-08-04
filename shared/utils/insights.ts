import type { Expense } from "../types/expense";

/** Semantic usage tokens for UI theming (web/RN map these to styles). */
export type UsageColorToken = "destructive" | "warning" | "success";

export const getUsageColor = (percentage: number): UsageColorToken => {
    if (percentage >= 100) return "destructive";
    if (percentage >= 80) return "warning";
    return "success";
};

export const getSmartInsight = (
    expenses: Expense[],
    monthlyBudget: number,
    selectedMonth: string
): { message: string; type: 'success' | 'warning' | 'danger' | 'neutral' } => {

    if (monthlyBudget <= 0) {
        return { message: "Set a monthly budget in Settings to see smart insights.", type: 'neutral' };
    }

    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const usagePercent = (totalSpent / monthlyBudget) * 100;

    // Check date context
    const now = new Date();
    const today = now.getDate();
    const currentMonthStr = now.toISOString().slice(0, 7);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const isCurrentMonth = selectedMonth === currentMonthStr;

    // 1. Critical Overspending (> 100%)
    if (usagePercent >= 100) {
        return {
            message: `You've exceeded your budget by ${Math.round(usagePercent - 100)}%. Try to limit non-essential spending.`,
            type: 'danger'
        };
    }

    // 2. High Usage Warning (> 80%)
    if (usagePercent >= 80) {
        return {
            message: `Heads up! You've used ${Math.round(usagePercent)}% of your budget.`,
            type: 'warning'
        };
    }

    // 3. Early Month Velocity Check (Only for current month)
    if (isCurrentMonth) {
        const monthProgress = (today / daysInMonth) * 100;

        // If spending is significantly faster than time passing (e.g. 50% spent in 10% of time)
        if (usagePercent > monthProgress + 20) {
            // Find top category
            const catTotals: Record<string, number> = {};
            expenses.forEach(e => catTotals[e.category] = (catTotals[e.category] || 0) + e.amount);
            const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

            if (topCat) {
                const catPercentOfBudget = Math.round((topCat[1] / monthlyBudget) * 100);
                return {
                    message: `You've spent ${Math.round(usagePercent)}% of your budget and it's only day ${today}. ${topCat[0]} makes up ${catPercentOfBudget}% of it.`,
                    type: 'warning'
                };
            }

            return {
                message: `You've spent ${Math.round(usagePercent)}% of your budget diverse categories. Pace yourself!`,
                type: 'warning'
            };
        }
    }

    // 4. Good Health
    if (usagePercent < 50 && isCurrentMonth && today > 20) {
        return {
            message: "You're doing great! End of month is approaching and you're well under budget.",
            type: 'success'
        };
    }

    return {
        message: "Your spending is on track.",
        type: 'success'
    };
};
