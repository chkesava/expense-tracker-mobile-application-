import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Stack } from "expo-router";

import { AddActionSheet } from "@/components/AddActionSheet";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { GlobalAddModals } from "@/components/GlobalAddModals";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { MobileActionDock } from "@/components/MobileActionDock";
import { PrivacyLock } from "@/components/PrivacyLock";
import { TabSwipeArea } from "@/components/navigation/TabSwipeArea";
import { GlassBlurScope, GlassBlurTarget } from "@/components/ui/GlassSurface";
import { OverlayProvider } from "@gluestack-ui/core/overlay/creator";
import { NavigationBar } from "expo-navigation-bar";
import { navigationBarStyleFor } from "@/lib/navigationBarStyle";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { SetupWizardModal } from "@/components/onboarding/SetupWizardModal";
import { useAndroidBackHandler } from "@/hooks/useAndroidBackHandler";
import { useAppShortcutHandler } from "@/hooks/useAppShortcutHandler";
import { useNavigationStateRestoration } from "@/hooks/useNavigationStateRestoration";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/providers/AuthProvider";
import { BottomChromeProvider } from "@/components/layout/BottomChromeProvider";
import { SpendlyUIScope } from "@/components/layout/SpendlyUIScope";
import { BorrowingsReceivablesProvider } from "@/providers/BorrowingsReceivablesProvider";
import { ExpenseReferenceDataProvider } from "@/providers/ExpenseReferenceDataProvider";
import { FinanceDataProvider } from "@/providers/FinanceDataProvider";
import { CreditCardBillsProvider } from "@/providers/CreditCardBillsProvider";
import { LedgerStateProvider } from "@/providers/LedgerStateProvider";
import { ModalProvider } from "@/providers/ModalProvider";
import { SetupProgressProvider } from "@/providers/SetupProgressProvider";
import { SmsReceiverProvider } from "@/providers/SmsReceiverProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

function AppShellInner() {
  const { settings } = useSettings();
  const { theme, themeName } = useTheme();
  const { user } = useAuth();

  // Android hardware / gesture Back button behavior
  useAndroidBackHandler();

  // Capture a home-screen shortcut before restoration so the saved route
  // cannot override Add Expense / Accounts / etc.
  useAppShortcutHandler();

  // Route state restoration across sessions, scoped to the signed-in user.
  useNavigationStateRestoration(user?.uid);

  return (
    // The clearance every list pads by has to describe the chrome actually
    // on screen, so the dock's centred FAB is not measured as a bar
    // (SPENDLY-141).
    <BottomChromeProvider navStyle={settings.navigationStyle}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* Gluestack dialogs/sheets portal here: inside every app provider,
            so their content can use them (SPENDLY-154). */}
        <OverlayProvider>
        {/* SPENDLY-154: Android 15 draws a contrast scrim behind the 3-button
            nav bar and picks its tone from the bar style. Follow the Spendly
            theme so dark themes get a dark scrim with light buttons instead
            of a light band under the capsule. The prop names the *button*
            colour; see lib/navigationBarStyle (SPENDLY-174). Android-only. */}
        <NavigationBar style={navigationBarStyleFor(themeUsesDarkPalette(themeName))} />
        <Header />
        {/* SPENDLY-161/170: the glass nav/dock blur whatever scrolls in the
            target. The scope wraps the chrome too, or it can't find it. */}
        <GlassBlurScope>
        <GlassBlurTarget>
        <TabSwipeArea>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.background },
              animation: "fade_from_bottom",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen
              name="dashboard"
              options={{
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="ledger"
              options={{
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="insights"
              options={{
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="vaults"
              options={{
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="investments"
              options={{
                animation: "fade",
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="sms-inbox"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="app-selector"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="accounts"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="credit-card-bills/[id]"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="transactions/[id]"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="epf/[establishmentId]"
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="add"
              options={{
                animation: "fade_from_bottom",
              }}
            />
          </Stack>
        </TabSwipeArea>
        </GlassBlurTarget>

        {settings.navigationStyle === "dock" ? <MobileActionDock /> : <BottomNav />}
        </GlassBlurScope>
        <AddTransactionModal />
        <AddActionSheet />
        <GlobalAddModals />
        <SetupWizardModal />
        </OverlayProvider>
      </View>
    </BottomChromeProvider>
  );
}

/**
 * Protected app shell — auth + maintenance + privacy lock + finance data + product navigation.
 */
export default function AppLayout() {
  const { theme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useSystemSettings();
  const { isAdmin, loading: roleLoading } = useUserRole();

  if (!user) {
    if (authLoading) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.background,
          }}
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      );
    }
    return <Redirect href="/(auth)/login" />;
  }

  if (settings.maintenanceMode && !isAdmin && !roleLoading && !settingsLoading) {
    return <MaintenanceScreen />;
  }

  const showGate = settingsLoading || roleLoading;

  return (
    <PrivacyLock>
      <SpendlyUIScope>
      <FinanceDataProvider>
        <ExpenseReferenceDataProvider>
          <BorrowingsReceivablesProvider>
            <CreditCardBillsProvider>
              <ModalProvider>
                <SetupProgressProvider>
                  <LedgerStateProvider>
                    <SmsReceiverProvider>
                      <AppShellInner />
                    </SmsReceiverProvider>
                  </LedgerStateProvider>
                </SetupProgressProvider>
              </ModalProvider>
            </CreditCardBillsProvider>
          </BorrowingsReceivablesProvider>
        </ExpenseReferenceDataProvider>
      </FinanceDataProvider>
      </SpendlyUIScope>
      {showGate ? (
        <View
          pointerEvents="auto"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.background,
              zIndex: 20,
            },
          ]}
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}
    </PrivacyLock>
  );
}
