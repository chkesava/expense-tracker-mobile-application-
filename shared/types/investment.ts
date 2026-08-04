export type InvestmentKind = "fixed_deposit" | "interest_savings" | "mutual_fund";

export type InterestMethod = "simple" | "compound";

export type InterestCreditFrequency =
  | "daily"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "at_maturity";

export type InvestmentStatus = "active" | "matured" | "closed";

export interface Investment {
  id: string;
  name: string;
  kind: InvestmentKind;
  principal: number;
  startDate: string;
  annualInterestRate?: number;
  interestMethod?: InterestMethod;
  creditFrequency?: InterestCreditFrequency;
  maturityDate?: string;
  linkedAccountId?: string;
  fundingExpenseId?: string;
  units?: number;
  purchaseNav?: number;
  currentNav?: number;
  lastNavUpdated?: string;
  status: InvestmentStatus;
  closedDate?: string;
  createdAt?: unknown;
}

export type InterestCreditEvent = {
  date: string;
  amount: number;
  balanceAfter: number;
};

export type InvestmentValuation = {
  principal: number;
  accruedInterest: number;
  totalValue: number;
  nextCreditDate: string | null;
  schedule: InterestCreditEvent[];
};
