import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";

import { MaintenanceScreen } from "@/components/MaintenanceScreen";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Protected app shell — requires auth; honors maintenance mode for non-admins.
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
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Home" }} />
    </Stack>
  );
}
