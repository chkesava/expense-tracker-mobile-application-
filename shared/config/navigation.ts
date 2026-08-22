export type NavSectionId = "home" | "ledger" | "investments" | "vaults" | "insights" | "settings" | "admin";

export type NavigationItem = {
  id: NavSectionId;
  path: string;
  label: string;
  mobileLabel?: string;
  includeInBottomNav?: boolean;
  includeInDrawer?: boolean;
  requiresInvestmentsFeature?: boolean;
};

export const CORE_NAV_ITEMS: NavigationItem[] = [
  {
    id: "home",
    path: "/dashboard",
    label: "Home",
    mobileLabel: "Home",
    includeInBottomNav: true,
    includeInDrawer: true,
  },
  {
    id: "ledger",
    path: "/ledger",
    label: "Transactions",
    mobileLabel: "Transactions",
    includeInBottomNav: true,
    includeInDrawer: true,
  },
  {
    id: "vaults",
    path: "/vaults",
    label: "Vaults",
    mobileLabel: "Vaults",
    includeInBottomNav: true,
    includeInDrawer: true,
  },
  {
    id: "investments",
    path: "/investments",
    label: "Investments",
    mobileLabel: "Investments",
    includeInBottomNav: true,
    includeInDrawer: true,
    requiresInvestmentsFeature: true,
  },
  {
    id: "insights",
    path: "/insights",
    label: "Insights",
    mobileLabel: "Insights",
    includeInBottomNav: true,
    includeInDrawer: true,
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    includeInBottomNav: false,
    includeInDrawer: true,
  },
];

export const ADMIN_NAV_ITEM: NavigationItem = {
  id: "admin",
  path: "/admin",
  label: "Admin",
  includeInBottomNav: false,
  includeInDrawer: true,
};

export const LEDGER_HUB_TAB_IDS = [
  "expenses",
  "accounts",
  "cards",
  "ccBills",
  "borrowings",
  "receivables",
  "subscriptions",
] as const;

export const VAULT_HUB_TAB_IDS = [
  "shared",
  "spaces",
  "splits",
  "travel",
  "collect",
] as const;

export const INVESTMENT_HUB_TAB_IDS = [
  "investments",
  "portfolio",
  "sip",
] as const;

/**
 * Old `/ledger?tab=` values that now live on Vaults or Investments.
 * Returns the replacement href, or null when the tab still belongs on ledger.
 */
export function resolveLegacyLedgerTabRoute(tab: string | undefined): string | null {
  if (!tab) return null;
  if (tab === "spaces" || tab === "splits" || tab === "travel" || tab === "collect") {
    return `/vaults?tab=${tab}`;
  }
  if (tab === "investments") return "/investments";
  if (tab === "portfolio" || tab === "sip") return `/investments?tab=${tab}`;
  return null;
}

const LEDGER_PREFIXES = [
  "/ledger",
  "/expenses",
  "/subscriptions",
  "/cards",
  "/accounts",
];
const INSIGHTS_PREFIXES = ["/insights", "/analytics", "/analysis"];
const VAULT_PREFIXES = ["/vaults", "/split", "/travel", "/collect"];
const INVESTMENTS_PREFIXES = ["/investments"];

function normalizePathname(pathname: string): string {
  if (!pathname) return "/dashboard";
  let clean = pathname.replace(/^\/\(app\)/, "");
  if (!clean || clean === "/") return "/dashboard";
  return clean;
}

/** Account detail (`/accounts/:id`), not the accounts list hub. */
export function isAccountDetailRoute(pathname: string): boolean {
  const clean = normalizePathname(pathname).split("?")[0];
  return /^\/accounts\/[^/]+$/.test(clean);
}

/**
 * What the Android hardware back button should do from a given route, once any
 * open modal has been ruled out.
 *
 * - `pop`     — a sub-screen: leave the stack, falling back to home if it is empty
 * - `home`    — a secondary top-level tab: return to the start destination
 * - `exit`    — already home: double-press to leave the app
 * - `default` — let the navigator handle it
 */
export type AndroidBackAction = "pop" | "home" | "exit" | "default";

/** Start destination of the app shell. */
export const HOME_ROUTE = "/dashboard";

const SUB_SCREEN_PREFIXES = [
  "/accounts/",
  "/credit-card-bills/",
  "/settings/",
];

const SUB_SCREEN_ROUTES = ["/settings", "/sms-inbox", "/app-selector", "/add"];

const SECONDARY_TAB_PREFIXES = ["/ledger", "/vaults", "/investments", "/insights"];

export function resolveAndroidBackAction(pathname: string): AndroidBackAction {
  const clean = normalizePathname(pathname);

  if (clean === HOME_ROUTE || clean === "/") return "exit";

  if (
    SUB_SCREEN_ROUTES.includes(clean) ||
    SUB_SCREEN_ROUTES.some((route) => clean.startsWith(`${route}?`)) ||
    SUB_SCREEN_PREFIXES.some((prefix) => clean.startsWith(prefix))
  ) {
    return "pop";
  }

  if (SECONDARY_TAB_PREFIXES.some((prefix) => clean.startsWith(prefix))) {
    return "home";
  }

  return "default";
}

export function isNavItemActive(pathname: string, id: NavSectionId): boolean {
  const clean = normalizePathname(pathname);
  if (id === "home") return clean === "/dashboard" || clean === "/";
  if (id === "settings") return clean.startsWith("/settings");
  if (id === "admin") return clean.startsWith("/admin");
  if (id === "vaults") return VAULT_PREFIXES.some((prefix) => clean.startsWith(prefix));
  if (id === "investments") {
    return INVESTMENTS_PREFIXES.some((prefix) => clean.startsWith(prefix));
  }
  if (id === "insights") return INSIGHTS_PREFIXES.some((prefix) => clean.startsWith(prefix));
  if (id === "ledger") return LEDGER_PREFIXES.some((prefix) => clean.startsWith(prefix));
  return false;
}

/**
 * Primary bottom-nav tabs in swipe order, keyed by section id. A route only
 * participates in horizontal tab swiping when it *is* one of these tabs — sub
 * screens such as `/accounts/:id` or `/settings` deliberately opt out even
 * though they highlight a bottom-nav item.
 */
const PRIMARY_TAB_ROUTES: Partial<Record<NavSectionId, string[]>> = {
  home: ["/dashboard", "/"],
  ledger: ["/ledger"],
  vaults: ["/vaults"],
  investments: ["/investments"],
  insights: ["/insights"],
};

/** Section id of the primary tab a pathname *is*, or null for sub screens. */
export function resolvePrimaryTabId(pathname: string): NavSectionId | null {
  const clean = normalizePathname(pathname).split("?")[0].replace(/\/$/, "");
  for (const [id, routes] of Object.entries(PRIMARY_TAB_ROUTES)) {
    if (routes?.includes(clean || "/")) return id as NavSectionId;
  }
  return null;
}
