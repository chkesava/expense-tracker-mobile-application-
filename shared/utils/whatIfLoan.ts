import { isValidDateKey, shiftDateKey, shiftMonthKey } from "./dates";
import { roundMoney } from "./money";
import type { WhatIfAdjustment, WhatIfProvenance } from "../types/whatIf";

export const WHAT_IF_LOAN_FREQUENCIES = ["monthly", "weekly"] as const;
export type WhatIfLoanFrequency = (typeof WHAT_IF_LOAN_FREQUENCIES)[number];

export interface WhatIfLoanInput {
  id: string;
  label: string;
  /** Planned borrowing/purchase amount before the optional down payment. */
  principal: number;
  downPayment?: number;
  annualInterestRatePct: number;
  tenureMonths: number;
  frequency: WhatIfLoanFrequency;
  startDate: string;
  /** Upfront fees are modeled as a separate hypothetical cash outflow. */
  fees?: number;
  provenance: WhatIfProvenance;
}

export interface WhatIfLoanPayment {
  date: string;
  openingPrincipal: number;
  payment: number;
  interest: number;
  principal: number;
  closingPrincipal: number;
}

export interface WhatIfLoanProjection {
  input: WhatIfLoanInput;
  financedPrincipal: number;
  paymentAmount: number;
  totalRepayment: number;
  totalInterest: number;
  totalFees: number;
  upfrontCashOutflow: number;
  startDate: string;
  endDate: string | null;
  payments: WhatIfLoanPayment[];
  adjustments: WhatIfAdjustment[];
  assumptions: string[];
  issues: string[];
}

const periodsPerYear = (frequency: WhatIfLoanFrequency) => frequency === "monthly" ? 12 : 52;
const periodCount = (input: WhatIfLoanInput) => input.frequency === "monthly"
  ? input.tenureMonths
  : Math.ceil(input.tenureMonths * 52 / 12);

function nextPaymentDate(startDate: string, frequency: WhatIfLoanFrequency): string {
  if (frequency === "weekly") return shiftDateKey(startDate, 7);
  const nextMonth = shiftMonthKey(startDate.slice(0, 7), 1);
  const day = Number(startDate.slice(8, 10));
  const year = Number(nextMonth.slice(0, 4));
  const month = Number(nextMonth.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();
  return `${nextMonth}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function paymentDates(startDate: string, frequency: WhatIfLoanFrequency, count: number): string[] {
  const dates: string[] = [];
  let date = nextPaymentDate(startDate, frequency);
  for (let index = 0; index < count; index += 1) {
    dates.push(date);
    date = frequency === "weekly" ? shiftDateKey(date, 7) : nextPaymentDate(date, frequency);
  }
  return dates;
}

function validateInput(input: WhatIfLoanInput): string[] {
  if (!input || typeof input !== "object") return ["loan input is required"];
  const errors: string[] = [];
  if (typeof input.id !== "string" || input.id.trim() === "") errors.push("id must not be empty");
  if (typeof input.label !== "string" || input.label.trim() === "") errors.push("label must not be empty");
  if (!Number.isFinite(input.principal) || input.principal <= 0) errors.push("principal must be greater than zero");
  if (!Number.isFinite(input.downPayment ?? 0) || (input.downPayment ?? 0) < 0) errors.push("downPayment must be zero or more");
  if ((input.downPayment ?? 0) > input.principal) errors.push("downPayment cannot exceed principal");
  if (!Number.isFinite(input.annualInterestRatePct) || input.annualInterestRatePct < 0 || input.annualInterestRatePct > 1000) errors.push("annualInterestRatePct must be from 0 to 1000");
  if (!Number.isInteger(input.tenureMonths) || input.tenureMonths < 1 || input.tenureMonths > 600) errors.push("tenureMonths must be a whole number from 1 to 600");
  if (!WHAT_IF_LOAN_FREQUENCIES.includes(input.frequency)) errors.push("frequency is invalid");
  if (!isValidDateKey(input.startDate)) errors.push("startDate must be a valid date");
  if (!Number.isFinite(input.fees ?? 0) || (input.fees ?? 0) < 0) errors.push("fees must be zero or more");
  return errors;
}

function scheduleForPayments(input: WhatIfLoanInput, amount: number, endDate: string): WhatIfAdjustment["schedule"] {
  if (input.frequency === "weekly") return { kind: "every_n_days", firstDate: nextPaymentDate(input.startDate, input.frequency), intervalDays: 7, untilDate: endDate };
  return { kind: "monthly", firstDate: nextPaymentDate(input.startDate, input.frequency), dayOfMonth: Number(input.startDate.slice(8, 10)), untilMonth: endDate.slice(0, 7) };
}

function adjustment(input: WhatIfLoanInput, amount: number, direction: "in" | "out", schedule: WhatIfAdjustment["schedule"], id: string, label: string): WhatIfAdjustment {
  return { id, label, kind: "debt", operation: "add", direction, amount, burnClass: "debt_service", schedule, provenance: input.provenance };
}

/**
 * Simulates a fixed-rate reducing-balance loan. The calculation is pure and
 * deliberately does not use the persisted Borrowing model or write a record.
 */
export function simulateWhatIfLoan(input: WhatIfLoanInput): WhatIfLoanProjection {
  const issues = validateInput(input);
  const fees = input?.fees ?? 0;
  const downPayment = input?.downPayment ?? 0;
  if (issues.length > 0) {
    return { input, financedPrincipal: 0, paymentAmount: 0, totalRepayment: 0, totalInterest: 0, totalFees: fees, upfrontCashOutflow: downPayment + fees, startDate: input?.startDate ?? "", endDate: null, payments: [], adjustments: [], assumptions: [], issues };
  }

  const financedPrincipal = roundMoney(input.principal - downPayment);
  const count = periodCount(input);
  const rate = input.annualInterestRatePct / 100 / periodsPerYear(input.frequency);
  const rawPayment = rate === 0 ? financedPrincipal / count : financedPrincipal * rate / (1 - Math.pow(1 + rate, -count));
  const paymentAmount = roundMoney(rawPayment);
  const dates = paymentDates(input.startDate, input.frequency, count);
  let balance = financedPrincipal;
  const payments: WhatIfLoanPayment[] = [];
  for (const [index, date] of dates.entries()) {
    const openingPrincipal = balance;
    const interest = roundMoney(openingPrincipal * rate);
    const payment = roundMoney(index === dates.length - 1 ? openingPrincipal + interest : Math.min(paymentAmount, openingPrincipal + interest));
    const principal = roundMoney(payment - interest);
    balance = roundMoney(Math.max(0, openingPrincipal - principal));
    payments.push({ date, openingPrincipal, payment, interest, principal, closingPrincipal: balance });
  }
  const totalRepayment = roundMoney(payments.reduce((sum, payment) => sum + payment.payment, 0));
  const totalInterest = roundMoney(payments.reduce((sum, payment) => sum + payment.interest, 0));
  const endDate = payments[payments.length - 1]?.date ?? null;
  const assumptions = [
    "Fixed-rate reducing-balance amortization is used.",
    input.frequency === "monthly" ? "Payments are monthly." : "Payments are weekly using 52 periods per year.",
    fees > 0 ? "Fees are modeled as an upfront hypothetical outflow." : "Fees are not modeled because none were supplied.",
    "This is an estimate, not a guaranteed borrowing offer.",
  ];
  const adjustments: WhatIfAdjustment[] = [
    adjustment(input, financedPrincipal, "in", { kind: "once", date: input.startDate }, `what-if:${input.id}:funding`, `${input.label} proceeds`),
    adjustment(input, paymentAmount, "out", scheduleForPayments(input, paymentAmount, endDate!), `what-if:${input.id}:repayment`, `${input.label} repayment`),
  ];
  if (downPayment > 0) adjustments.push(adjustment(input, downPayment, "out", { kind: "once", date: input.startDate }, `what-if:${input.id}:down-payment`, `${input.label} down payment`));
  if (fees > 0) adjustments.push(adjustment(input, fees, "out", { kind: "once", date: input.startDate }, `what-if:${input.id}:fees`, `${input.label} fees`));
  return { input, financedPrincipal, paymentAmount, totalRepayment, totalInterest, totalFees: fees, upfrontCashOutflow: roundMoney(downPayment + fees), startDate: input.startDate, endDate, payments, adjustments, assumptions, issues: [] };
}
