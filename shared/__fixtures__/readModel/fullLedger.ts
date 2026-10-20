/**
 * SPENDLY-503 — golden fixture: one synthetic user whose ledger exercises every
 * flow kind the read model must reproduce. Entirely made up; no real data.
 *
 * Flows covered:
 * - bank expenses and income, a soft-deleted expense, a restored expense
 *   (live again), and a cross-month edit (`month` differs from `date`);
 * - transfers both ways between bank and wallet;
 * - manual entries (bank credit, card fee debit);
 * - card spend over two cycles, a closed statement, a partial bill payment,
 *   provider cashback, a voided payment and a refund (income) into the card;
 * - a borrowing with simple interest and a repayment;
 * - a receivable (money lent) and a partial collection;
 * - EPF: one establishment, credited contributions and FY interest;
 * - a holding with a BUY and a reversal, plus investment cash.
 *
 * `today` for every expectation is {@link FIXTURE_TODAY}. Stored balances are
 * set to the values the ledger implies, so a clean baseline shows no variance.
 */
import type { BaselineRows } from "../../utils/financialBaseline";

export const FIXTURE_TODAY = "2026-10-20";

const accountTypes = [
  { id: "t-bank", name: "Bank Account" },
  { id: "t-cash", name: "Cash Wallet" },
  { id: "t-card", name: "Credit Card" },
];

const expenses = [
  { id: "e1", amount: 1200, date: "2026-09-03", month: "2026-09", accountId: "bank", category: "Food & Groceries", subcategory: "Groceries / Kirana" },
  { id: "e2", amount: 450, date: "2026-09-15", month: "2026-09", accountId: "bank", category: "Transport & Vehicles", subcategory: "Petrol" },
  // Soft-deleted: counted as inactive, never summed.
  { id: "e3", amount: 999, date: "2026-09-16", month: "2026-09", accountId: "bank", category: "Shopping & Clothing", deletedAt: "2026-09-17T10:00:00.000Z" },
  // Restored: deleted once, live again (deletedAt cleared).
  { id: "e4", amount: 300, date: "2026-10-02", month: "2026-10", accountId: "bank", category: "Health & Medical", subcategory: "Medicines", deletedAt: "" },
  // Cross-month edit: dated 30 Sep, booked to October.
  { id: "e5", amount: 250, date: "2026-09-30", month: "2026-10", accountId: "wallet", category: "Food & Groceries", subcategory: "Other Food" },
  // Card spend: one in the closed cycle (21 Aug – 20 Sep), two in the open one.
  { id: "c1", amount: 4000, date: "2026-09-05", month: "2026-09", accountId: "card", category: "Shopping & Clothing", subcategory: "Electronics" },
  { id: "c2", amount: 1500, date: "2026-09-25", month: "2026-09", accountId: "card", category: "Entertainment & Hobbies", subcategory: "OTT" },
  { id: "c3", amount: 800, date: "2026-10-10", month: "2026-10", accountId: "card", category: "Food & Groceries", subcategory: "Restaurants & Dining" },
];

const incomes = [
  { id: "i1", amount: 50000, date: "2026-09-01", month: "2026-09", accountId: "bank", source: "Salary" },
  // A refund into the card (SPENDLY-497: a card credit).
  { id: "i2", amount: 200, date: "2026-10-12", month: "2026-10", accountId: "card", source: "Refund" },
];

const accountTransfers = [
  { id: "t1", fromAccountId: "bank", toAccountId: "wallet", amount: 2000, date: "2026-09-02", month: "2026-09" },
  { id: "t2", fromAccountId: "wallet", toAccountId: "bank", amount: 500, date: "2026-10-01", month: "2026-10" },
];

const accountEntries = [
  { id: "n1", accountId: "bank", amount: 100, direction: "credit", date: "2026-09-10", source: "manual" },
  { id: "n2", accountId: "card", amount: 50, direction: "debit", date: "2026-10-05", source: "manual" },
];

const accountPayments = [
  // Partial payment of the 20 Sep statement (4000).
  { id: "p1", fromAccountId: "bank", toAccountId: "card", amount: 3000, date: "2026-09-25", sourceType: "account", creditCardBillId: "card_2026-09-20" },
  // Provider cashback.
  { id: "p2", fromAccountId: "cashback", toAccountId: "card", amount: 100, date: "2026-10-08", sourceType: "cashback", cashbackKind: "statement_credit" },
  // Voided: kept on file, never counted.
  { id: "p3", fromAccountId: "bank", toAccountId: "card", amount: 999, date: "2026-10-09", sourceType: "account", voidedAt: "2026-10-09T12:00:00.000Z" },
];

const creditCardBills = [
  {
    id: "card_2026-09-20",
    accountId: "card",
    statementDate: "2026-09-20",
    billingPeriodStart: "2026-08-21",
    billingPeriodEnd: "2026-09-20",
    dueDate: "2026-10-08",
    statementAmount: 4000,
    minimumDueAmount: 200,
    amountPaid: 3000,
    remainingAmount: 1000,
    currency: "INR",
    status: "PARTIALLY_PAID",
    paymentIds: ["p1"],
  },
];

const borrowings = [
  {
    id: "b1",
    userId: "fixture-user",
    lenderType: "FRIEND",
    lenderName: "A friend",
    principalAmount: 20000,
    interestRate: 12,
    interestType: "SIMPLE",
    interestFrequency: "ANNUAL",
    interestBasis: "OUTSTANDING_PRINCIPAL",
    borrowedDate: "2026-09-01",
    creditedAccountId: "bank",
    status: "ACTIVE",
  },
];

const borrowingRepayments = [
  { id: "br1", borrowingId: "b1", amount: 5000, principalComponent: 5000, interestComponent: 0, date: "2026-10-01", paymentAccountId: "bank" },
];

const receivables = [
  {
    id: "r1",
    userId: "fixture-user",
    personType: "FRIEND",
    personName: "B friend",
    originalAmount: 3000,
    lentDate: "2026-09-12",
    sourceAccountId: "bank",
    status: "ACTIVE",
    interestRate: 0,
    interestType: "NONE",
  },
];

const receivableRepayments = [
  { id: "rr1", receivableId: "r1", amount: 1000, principalComponent: 1000, interestComponent: 0, date: "2026-10-03", receivedAccountId: "wallet" },
];

const epfEstablishments = [
  {
    id: "est1",
    profileId: "main",
    employerName: "Fixture Employer",
    establishmentNumber: "MHBAN0012345000",
    memberId: "MHBAN00123450000012345",
    dateJoined: "2020-01-01",
    employmentStatus: "current",
  },
];

const epfContribution = (month: string) => ({
  id: `est1_${month}`,
  establishmentId: "est1",
  month,
  wage: 25000,
  employeeShare: 3000,
  employerShare: 3000,
  epsShare: 1250,
  employerEpfShare: 1750,
  totalContribution: 6000,
  epfCredit: 4750,
  status: "credited",
  source: "simulated",
  epsEligible: true,
});

const epfInterestEntries = [
  {
    id: "est1_2025-26",
    establishmentId: "est1",
    financialYear: "2025-26",
    rate: 0.0825,
    basis: "monthlyRunningBalance",
    openingBalance: 0,
    interest: 412.5,
    closingBalance: 412.5,
  },
];

const holdings = [{ id: "h1", symbol: "INFY", quantity: 5, averageBuyPrice: 1500, instrumentType: "EQUITY" }];
const portfolioTransactions = [
  { id: "pt1", holdingId: "h1", symbol: "INFY", type: "BUY", quantity: 6, price: 1500, date: "2026-09-08" },
  { id: "pt2", holdingId: "h1", symbol: "INFY", type: "SELL", quantity: 1, price: 1500, date: "2026-09-09", reversalOf: "pt1" },
];
const investmentCashTransactions = [
  { id: "ic1", amount: 10000, direction: "credit", date: "2026-09-07", source: "deposit" },
  { id: "ic2", amount: 7500, direction: "debit", date: "2026-09-08", source: "buy" },
];

/** Stored balances equal what the ledger implies, so the baseline is clean. */
const accounts = [
  // 10000 + 50000 − 1200 − 450 − 300 − 2000 + 500 + 100 − 3000 + 20000 − 5000 − 3000
  { id: "bank", name: "Fixture Bank", typeId: "t-bank", openingBalance: 10000, currentBalance: 65650, balanceInitialized: true },
  // 0 − 250 + 2000 − 500 + 1000
  { id: "wallet", name: "Fixture Wallet", typeId: "t-cash", openingBalance: 0, currentBalance: 2250, balanceInitialized: true },
  // 4000 + 1500 + 800 + 50 − 3000 − 100 − 200
  { id: "card", name: "Fixture Card", typeId: "t-card", creditLimit: 50000, billGenerationDay: 20, currentOutstanding: 3050, balanceInitialized: true },
];

export function fullLedgerFixture(): BaselineRows {
  return {
    expenses,
    incomes,
    ledgerEvents: [{ id: "le1", kind: "expense", docId: "e3", action: "delete" }],
    accounts,
    accountTypes,
    accountTransfers,
    accountEntries,
    accountPayments,
    creditCardBills,
    categories: [{ id: "cat1", name: "Food & Groceries", kind: "category" }],
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
    subscriptions: [],
    investments: [],
    holdings,
    portfolioTransactions,
    investmentCashTransactions,
    portfolioSettings: [],
    epfEstablishments,
    epfContributions: [epfContribution("2026-08"), epfContribution("2026-09")],
    epfTransfers: [],
    epfInterestEntries,
    epfReconciliations: [],
  } as unknown as BaselineRows;
}
