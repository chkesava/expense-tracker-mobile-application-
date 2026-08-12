import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRouter } from "expo-router";

const LAST_ROUTE_KEY = "@vault_last_active_route";

export function useNavigationStateRestoration(isAuthenticated: boolean) {
  const pathname = usePathname();
  const router = useRouter();
  const restored = useRef(false);

  // 1. Save last active route on change
  useEffect(() => {
    if (!isAuthenticated || !pathname) return;
    const clean = pathname.replace(/^\/\(app\)/, "");
    if (
      clean &&
      clean !== "/" &&
      clean !== "/(auth)/login" &&
      !clean.includes("login")
    ) {
      AsyncStorage.setItem(LAST_ROUTE_KEY, clean).catch(() => undefined);
    }
  }, [pathname, isAuthenticated]);

  // 2. Restore last active route on launch (if on default dashboard/root)
  useEffect(() => {
    if (!isAuthenticated || restored.current) return;
    restored.current = true;

    AsyncStorage.getItem(LAST_ROUTE_KEY)
      .then((savedRoute) => {
        if (savedRoute && savedRoute !== "/dashboard" && savedRoute !== "/") {
          // Only restore if user was on a top-level tab or sub-screen
          const validRoutes = [
            "/ledger",
            "/vaults",
            "/insights",
            "/settings",
            "/sms-inbox",
            "/app-selector",
          ];
          if (
            validRoutes.some((r) => savedRoute.startsWith(r)) ||
            savedRoute.startsWith("/accounts/")
          ) {
            router.replace(savedRoute as any);
          }
        }
      })
      .catch(() => undefined);
  }, [isAuthenticated, router]);
}
