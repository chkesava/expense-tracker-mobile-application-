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
    label: "Ledger",
    mobileLabel: "Ledger",
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

export function isNavItemActive(pathname: string, id: NavSectionId): boolean {
  if (id === "home") return pathname === "/dashboard";
  if (id === "settings") return pathname.startsWith("/settings");
  if (id === "admin") return pathname.startsWith("/admin");
  if (id === "vaults") return VAULT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (id === "insights") return INSIGHTS_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  return LEDGER_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
