import { useEffect, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useModals } from "@/providers/ModalProvider";
import {
  HOME_ROUTE,
  resolveAndroidBackAction,
} from "@/shared/config/navigation";

/**
 * Android Back Button Handler
 * 
 * Follows Material Design 3 and Android navigation standards:
 * 1. Closes any open modal, bottom sheet, or drawer first.
 * 2. Pops stack sub-screens back to parent screens (e.g., /accounts/[id] -> /ledger).
 * 3. Returns to the primary start destination (/dashboard) when on secondary tabs (/ledger, /vaults, /investments, /insights).
 * 4. Shows exit confirmation / exits gracefully when already on /dashboard.
 *
 * The route → action decision lives in `resolveAndroidBackAction` so it can be
 * tested without a navigator.
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

      switch (resolveAndroidBackAction(pathname ?? HOME_ROUTE)) {
        // 2. Stack sub-screens (/accounts/[id], /settings, /add, …) -> pop.
        //    A sub-screen entered directly from a deep link has nothing to pop
        //    back to, so fall through to home rather than exiting the app.
        case "pop":
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace(HOME_ROUTE);
          }
          return true;

        // 3. Secondary top-level tabs -> return to the start destination.
        //    `dismissTo` pops back to the existing home screen instead of
        //    stacking a second copy of it, which `replace` used to do on every
        //    single back press.
        case "home":
          router.dismissTo(HOME_ROUTE);
          return true;

        // 4. Already home -> double press to exit.
        case "exit": {
          const now = Date.now();
          if (now - lastBackPressTime.current < 2000) {
            BackHandler.exitApp();
            return true;
          }
          lastBackPressTime.current = now;
          ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
          return true;
        }

        default:
          return false;
      }
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => subscription.remove();
  }, [router, pathname, modals]);
}
