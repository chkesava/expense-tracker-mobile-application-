/**
 * Phase 0 shared contracts — types, taxonomy, config, pure utils, Zod schemas.
 * No React Native UI, Firebase, or navigation runtimes.
 */

export * from "./types/expense";
export * from "./types/focus";
export * from "./types/investment";
export * from "./types/market";
export * from "./types/nutrition";
export * from "./types/paymentRequest";
export * from "./types/split";
export * from "./types/stats";
export * from "./types/subscription";
export * from "./types/trip";
export * from "./types/user";
export * from "./types/vault";
export * from "./types/vaultExpense";
export * from "./types/smsTransaction";

export * from "./data/categoryTaxonomy";
export * from "./config/navigation";

export * from "./utils/formatCurrency";
export * from "./utils/dates";
export * from "./utils/accountBalance";
export * from "./utils/accountKind";
export * from "./utils/billingCycle";
export * from "./utils/investmentInterest";
export * from "./utils/analytics";
export * from "./utils/rangeAnalytics";
export * from "./utils/monthSummary";
export * from "./utils/weeklySummary";
export * from "./utils/monthlyComparison";
export * from "./utils/incomeSummary";
export * from "./utils/insightMetrics";
export * from "./utils/insights";
export * from "./utils/smartSummary";
export * from "./utils/categoryInsights";
/** List grouping (today/yesterday/earlier) — web module name collided with chart helper */
export { groupByDay as groupExpensesByRecency } from "./utils/grouping";
/** Chart-friendly date → amount rows */
export { groupByDay } from "./utils/groupByDay";
export * from "./utils/dayGrouping";
export * from "./utils/upi";
export * from "./utils/paymentSlug";
export * from "./utils/paymentRequestUrl";
export * from "./utils/paymentRequestPath";
export * from "./utils/qrStyles";
export * from "./utils/magicParser";
export * from "./utils/proactiveSplits";
export * from "./utils/chartColors";
export * from "./utils/categoryPreferences";

export * from "./storage/memoryStorage";

export * as portfolioTypes from "./features/portfolio/types";
export * as portfolioSchemas from "./features/portfolio/schemas";
export * as sipTypes from "./features/sip/types";
export * as sipSchemas from "./features/sip/schemas";
