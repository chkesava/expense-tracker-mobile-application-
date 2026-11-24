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
  /**
   * SPENDLY: last date the fd-interest-daily job credited this FD's
   * compounding interest. Explicit `null` (set by the app after an interest
   * rate edit) means "treat as never credited" -- the next run re-walks the
   * whole history at the current rate. The job's own check treats `null` and
   * `undefined` identically.
   */
  lastInterestCreditedDate?: string | null;
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
