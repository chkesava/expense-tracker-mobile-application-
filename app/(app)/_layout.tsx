import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";

import { AddTransactionModal } from "@/components/AddTransactionModal";
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { MobileActionDock } from "@/components/MobileActionDock";
import { PrivacyLock } from "@/components/PrivacyLock";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/providers/AuthProvider";
import { FinanceDataProvider } from "@/providers/FinanceDataProvider";
import { LedgerStateProvider } from "@/providers/LedgerStateProvider";
import { ModalProvider } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

function AppShellInner() {
  const { settings } = useSettings();

  return (
    <View style={{ flex: 1 }}>
      <Header />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="ledger" />
        <Stack.Screen name="insights" />
        <Stack.Screen name="vaults" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="app-selector" />
      </Stack>

      {settings.navigationStyle === "dock" ? <MobileActionDock /> : <BottomNav />}
      <AddTransactionModal />
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

  if (authLoading || settingsLoading || (user && roleLoading)) {
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

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  if (settings.maintenanceMode && !isAdmin) {
    return <MaintenanceScreen />;
  }

  return (
    <PrivacyLock>
      <FinanceDataProvider>
        <ModalProvider>
          <LedgerStateProvider>
            <AppShellInner />
          </LedgerStateProvider>
        </ModalProvider>
      </FinanceDataProvider>
    </PrivacyLock>
  );
}
