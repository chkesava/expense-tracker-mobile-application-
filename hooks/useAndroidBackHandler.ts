import { useEffect, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useModals } from "@/providers/ModalProvider";

/**
 * Android Back Button Handler
 * 
 * Follows Material Design 3 and Android navigation standards:
 * 1. Closes any open modal, bottom sheet, or drawer first.
 * 2. Pops stack sub-screens back to parent screens (e.g., /accounts/[id] -> /ledger).
 * 3. Returns to the primary start destination (/dashboard) when on secondary tabs (/ledger, /vaults, /insights).
 * 4. Shows exit confirmation / exits gracefully when already on /dashboard.
 */
export function useAndroidBackHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const modals = useModals();
  const lastBackPressTime = useRef<number>(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBackPress = () => {
      // 1. Priority: Close open modals / bottom sheets / drawers
      if (modals.isAddExpenseOpen) {
        modals.setIsAddExpenseOpen(false);
        modals.setEditingExpense(null);
        modals.setEditingIncome(null);
        return true;
      }

      if (modals.isMonthDrawerOpen) {
        modals.setIsMonthDrawerOpen(false);
        return true;
      }

      if (modals.isMagicChatOpen) {
        modals.setIsMagicChatOpen(false);
        return true;
      }

      if (modals.isReceiptScannerOpen) {
        modals.setIsReceiptScannerOpen(false);
        return true;
      }

      if (modals.isSetupWizardOpen) {
        modals.setIsSetupWizardOpen(false);
        return true;
      }

      // Clean pathname
      const cleanPath = pathname ? pathname.replace(/^\/\(app\)/, "") : "/dashboard";

      // 2. Stack Sub-screens (e.g. /accounts/[id], /settings, /app-selector) -> pop back
      const isSubScreen =
        cleanPath.startsWith("/accounts/") ||
        cleanPath === "/settings" ||
        cleanPath === "/sms-inbox" ||
        cleanPath === "/app-selector" ||
        cleanPath.startsWith("/(nutrition)/");

      if (isSubScreen) {
        if (router.canGoBack()) {
          router.back();
          return true;
        }
        router.replace("/dashboard");
        return true;
      }

      // 3. Secondary Top-level Tabs (/ledger, /vaults, /insights) -> Return to start destination (/dashboard)
      if (
        cleanPath === "/ledger" ||
        cleanPath === "/vaults" ||
        cleanPath === "/insights" ||
        cleanPath.startsWith("/ledger")
      ) {
        router.replace("/dashboard");
        return true;
      }

      // 4. On Root / Dashboard -> Double press back to exit app
      if (cleanPath === "/dashboard" || cleanPath === "/" || !cleanPath) {
        const now = Date.now();
        if (now - lastBackPressTime.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressTime.current = now;
        ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => subscription.remove();
  }, [router, pathname, modals]);
}
