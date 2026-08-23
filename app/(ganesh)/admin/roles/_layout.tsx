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
      <Stack.Screen name="index" options={{ title: "Roles & permissions" }} />
      <Stack.Screen name="new" options={{ title: "Create role" }} />
      <Stack.Screen name="[id]" options={{ title: "Role" }} />
    </Stack>
  );
}
