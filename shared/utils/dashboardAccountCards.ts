import type { NetWorthTotals } from "./netWorth";

export type DashboardAccountCardKey =
  | "bank"
  | "cards"
  | "deposits"
  | "stocks"
  | "epf"
  | "lent"
  | "loans"
  | "overdraft";

export type DashboardAccountCard = {
  key: DashboardAccountCardKey;
  label: string;
  /** Straight from the net-worth summary — never re-derived here. */
  value: number;
  /** Money owed: shown with a minus sign and an "Owed" caption, not colour alone. */
  owed: boolean;
  caption?: string;
  /** Existing screen the card opens, or null when its hub is switched off. */
  route: string | null;
};

type CardInputs = Pick<
  NetWorthTotals,
  | "liquidBankAssets"
  | "creditCardLiabilities"
  | "investmentsValue"
  | "totalStocksValue"
  | "epfValue"
  | "epfUnreconciledCount"
  | "borrowingLiabilities"
  | "receivableAssets"
  | "bankOverdraftLiabilities"
>;

/**
 * SPENDLY-532 — the dashboard's account cards, one per kind of money in the
 * net-worth summary. Bank & cash always shows (it is where a new user starts);
 * every other kind appears only when the user holds some, so there are no
 * empty ₹0 tiles. Pure selection: no value is added, netted or projected.
 */
export function dashboardAccountCards(
  netWorth: CardInputs,
  investmentsEnabled: boolean
): DashboardAccountCard[] {
  const investRoute = (tab: string) =>
    investmentsEnabled ? `/investments?tab=${tab}` : null;

  const cards: DashboardAccountCard[] = [
    {
      key: "bank",
      label: "Bank & cash",
      value: netWorth.liquidBankAssets,
      owed: false,
      route: "/ledger?tab=accounts",
    },
    {
      key: "cards",
      label: "Credit cards",
      value: netWorth.creditCardLiabilities,
      owed: true,
      route: "/ledger?tab=ccBills",
    },
    {
      key: "deposits",
      label: "Deposits",
      value: netWorth.investmentsValue,
      owed: false,
      caption: "FD & RD",
      route: investRoute("investments"),
    },
    {
      key: "stocks",
      label: "Stocks",
      value: netWorth.totalStocksValue,
      owed: false,
      caption: "Holdings + cash",
      route: investRoute("portfolio"),
    },
    {
      key: "epf",
      label: "EPF",
      value: netWorth.epfValue,
      owed: false,
      // KAN-71: derived from what the user recorded, not from EPFO.
      caption: netWorth.epfUnreconciledCount > 0 ? "Simulated" : undefined,
      route: investRoute("epf"),
    },
    {
      key: "lent",
      label: "Money lent",
      value: netWorth.receivableAssets,
      owed: false,
      route: "/ledger?tab=receivables",
    },
    {
      key: "loans",
      label: "Loans",
      value: netWorth.borrowingLiabilities,
      owed: true,
      route: "/ledger?tab=borrowings",
    },
    {
      key: "overdraft",
      label: "Overdrafts",
      value: netWorth.bankOverdraftLiabilities,
      owed: true,
      route: "/ledger?tab=accounts",
    },
  ];

  return cards.filter((card) => card.key === "bank" || card.value > 0);
}
