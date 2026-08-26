import { Stack } from "expo-router";

import { AdminGate } from "@/components/ganesh/AdminGate";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshAdminLayout() {
  const { theme } = useTheme();

  return (
    <AdminGate>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTintColor: theme.colors.foreground,
          headerStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {/* The dashboard draws its own GaneshHeader, matching the Expense
            Tracker's in-content PageHeader. Sub-screens keep the native bar
            until they are redesigned. */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="festivals" options={{ headerShown: false }} />
        <Stack.Screen name="categories" options={{ headerShown: false }} />
        <Stack.Screen name="audit" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="reports" options={{ headerShown: false }} />
        <Stack.Screen name="roles" options={{ headerShown: false }} />
      </Stack>
    </AdminGate>
  );
}
