import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Stack } from "expo-router";

import { AddTransactionModal } from "@/components/AddTransactionModal";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { MobileActionDock } from "@/components/MobileActionDock";
import { PrivacyLock } from "@/components/PrivacyLock";
import { TabSwipeArea } from "@/components/navigation/TabSwipeArea";
import { SetupWizardModal } from "@/components/onboarding/SetupWizardModal";
import { useAndroidBackHandler } from "@/hooks/useAndroidBackHandler";
import { useNavigationStateRestoration } from "@/hooks/useNavigationStateRestoration";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/providers/AuthProvider";
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
  const { theme } = useTheme();
  const { user } = useAuth();

  // Android hardware / gesture Back button behavior
  useAndroidBackHandler();

  // Route state restoration across sessions, scoped to the signed-in user.
  useNavigationStateRestoration(user?.uid);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header />
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
            name="add"
            options={{
              animation: "fade_from_bottom",
            }}
          />
        </Stack>
      </TabSwipeArea>

      {settings.navigationStyle === "dock" ? <MobileActionDock /> : <BottomNav />}
      <AddTransactionModal />
      <SetupWizardModal />
    </View>
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
