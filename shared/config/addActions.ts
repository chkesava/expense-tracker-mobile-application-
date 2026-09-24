/**
 * What the global add FAB offers, and in what order.
 *
 * SPENDLY-141: the sheet used to list five fixed actions, so recording a
 * borrowing or money lent meant leaving the sheet, navigating to that section
 * and finding its own button — while the sheet itself offered "Investment" on
 * a screen about credit-card bills. The catalogue below is the whole set, and
 * the order is a function of where the tap happened: the section you are
 * looking at puts its own entries first, and everything else keeps its
 * canonical order underneath so the sheet never reshuffles unpredictably.
 *
 * Pure module: no React and no react-native, so the ordering is provable.
 */

export const ADD_ACTION_IDS = [
  "expense",
  "income",
  "transfer",
  "receivable",
  "borrowing",
  "recurring",
  "investment",
  "cardBill",
] as const;

export type AddActionId = (typeof ADD_ACTION_IDS)[number];

export type AddActionMeta = {
  id: AddActionId;
  label: string;
  hint: string;
  /** Hidden unless the investments feature is on for this user. */
  requiresInvestments?: boolean;
};

/**
 * Canonical order — what the sheet shows when nothing is prioritised, and the
 * tie-break for everything a context does not name.
 */
export const ADD_ACTIONS: AddActionMeta[] = [
  {
    id: "expense",
    label: "Expense",
    hint: "Log a spend against a category",
  },
  {
    id: "income",
    label: "Income",
    hint: "Record salary, refund, or other inflow",
  },
  {
    id: "transfer",
    label: "Transfer",
    hint: "Move money between accounts",
  },
  {
    id: "receivable",
    label: "Money Lent",
    hint: "Track money you lent and expect back",
  },
  {
    id: "borrowing",
    label: "Borrowing",
    hint: "Track money you borrowed and owe back",
  },
  {
    id: "recurring",
    label: "Recurring Payment",
    hint: "Set up a subscription, EMI or auto-transfer",
  },
  {
    id: "investment",
    label: "Investment",
    hint: "Add an FD, fund, or other holding",
    requiresInvestments: true,
  },
  {
    id: "cardBill",
    label: "Card Bill Payment",
    hint: "Pay a credit-card statement",
  },
];

/**
 * Where the FAB was tapped. The Money hub's sections map one-to-one onto
 * `LedgerHubTabId`; everything else collapses to `general`, which is also the
 * fallback for a route this map has not been taught.
 */
export type AddActionContext =
  | "journal"
  | "accounts"
  | "cards"
  | "ccBills"
  | "borrowings"
  | "receivables"
  | "subscriptions"
  | "general";

/**
 * Actions the context puts first, most relevant first. Only ever a reordering
 * — nothing is hidden by context, because the FAB is the one add button on
 * screens that have no other.
 */
const CONTEXT_PRIORITY: Record<AddActionContext, AddActionId[]> = {
  // The Journal is the transaction list, so the three transaction kinds lead.
  journal: ["expense", "income", "transfer"],
  // Accounts is about where money sits, so moving it between them leads.
  accounts: ["transfer", "expense", "income"],
  cards: ["expense", "cardBill", "transfer"],
  ccBills: ["cardBill", "expense"],
  borrowings: ["borrowing", "expense"],
  receivables: ["receivable", "expense"],
  subscriptions: ["recurring", "expense"],
  general: [],
};

export type OrderAddActionsOptions = {
  /** Drops `investment` when the feature is off for this user. */
  investmentsEnabled?: boolean;
};

export type OrderedAddActions = {
  /** Led by the current section. Empty when the context prioritises nothing. */
  suggested: AddActionMeta[];
  /** Everything else, in canonical order. */
  rest: AddActionMeta[];
};

/**
 * The sheet's rows for a context: what this section suggests, and the rest in
 * canonical order. Every available action appears in exactly one of the two.
 */
export function orderAddActions(
  context: AddActionContext,
  { investmentsEnabled = false }: OrderAddActionsOptions = {}
): OrderedAddActions {
  const available = ADD_ACTIONS.filter(
    (action) => !action.requiresInvestments || investmentsEnabled
  );
  const byId = new Map(available.map((action) => [action.id, action]));

  const priority = CONTEXT_PRIORITY[context] ?? [];
  const suggested: AddActionMeta[] = [];
  const seen = new Set<AddActionId>();

  for (const id of priority) {
    const action = byId.get(id);
    if (!action || seen.has(id)) continue;
    suggested.push(action);
    seen.add(id);
  }

  return {
    suggested,
    rest: available.filter((action) => !seen.has(action.id)),
  };
}

/** Flat row order, for callers that do not render the suggested group. */
export function flatAddActions(
  context: AddActionContext,
  options: OrderAddActionsOptions = {}
): AddActionMeta[] {
  const { suggested, rest } = orderAddActions(context, options);
  return [...suggested, ...rest];
}

/**
 * Route + active Money-hub section → the context the sheet should order for.
 *
 * The hub keeps its section in provider state rather than the URL, so the
 * caller passes it in; it only counts while the hub is the screen you are on.
 * Stack detail screens resolve from their own path, so opening the sheet on a
 * card's bill still leads with the bill payment.
 */
export function resolveAddActionContext(
  pathname: string,
  ledgerSection?: string | null
): AddActionContext {
  const clean = (pathname || "").replace(/^\/\(app\)/, "").split("?")[0];

  if (/^\/credit-card-bills(\/|$)/.test(clean)) return "ccBills";
  if (/^\/accounts(\/|$)/.test(clean)) return "accounts";
  if (/^\/transactions(\/|$)/.test(clean)) return "journal";

  if (/^\/ledger(\/|$)/.test(clean)) {
    switch (ledgerSection) {
      case "expenses":
        return "journal";
      case "accounts":
        return "accounts";
      case "cards":
        return "cards";
      case "ccBills":
        return "ccBills";
      case "borrowings":
        return "borrowings";
      case "receivables":
        return "receivables";
      case "subscriptions":
        return "subscriptions";
      default:
        return "journal";
    }
  }

  return "general";
}
