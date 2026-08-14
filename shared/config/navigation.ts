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

const LEDGER_PREFIXES = [
  "/ledger",
  "/expenses",
  "/split",
  "/subscriptions",
  "/travel",
  "/cards",
  "/accounts",
  "/collect",
  "/investments",
];
const INSIGHTS_PREFIXES = ["/insights", "/analytics", "/analysis"];
const VAULT_PREFIXES = ["/vaults"];

function normalizePathname(pathname: string): string {
  if (!pathname) return "/dashboard";
  let clean = pathname.replace(/^\/\(app\)/, "");
  if (!clean || clean === "/") return "/dashboard";
  return clean;
}

export function isNavItemActive(pathname: string, id: NavSectionId): boolean {
  const clean = normalizePathname(pathname);
  if (id === "home") return clean === "/dashboard" || clean === "/";
  if (id === "settings") return clean.startsWith("/settings");
  if (id === "admin") return clean.startsWith("/admin");
  if (id === "vaults") return VAULT_PREFIXES.some((prefix) => clean.startsWith(prefix));
  if (id === "insights") return INSIGHTS_PREFIXES.some((prefix) => clean.startsWith(prefix));
  return LEDGER_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

