import { Stack } from "expo-router";

import { useTheme } from "@/theme/ThemeProvider";

export default function AdminRolesLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: theme.colors.foreground,
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {/* All three draw their own GaneshHeader, matching the Expense
          Tracker's in-content PageHeader. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
