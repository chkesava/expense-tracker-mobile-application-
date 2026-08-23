import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { PrivacyLock } from "@/components/PrivacyLock";
import { useAuth } from "@/providers/AuthProvider";
import { GaneshSessionProvider } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

function GaneshGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { user, loading } = useAuth();

  if (loading) {
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
    return <Redirect href={"/(ganesh-auth)/login" as never} />;
  }

  return <>{children}</>;
}

function GaneshStack() {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: "Your Pandals" }} />
      <Stack.Screen name="add-collection" options={{ title: "Add collection" }} />
      <Stack.Screen name="add-expense" options={{ title: "Add expense" }} />
      <Stack.Screen name="add-contribution" options={{ title: "Add contribution" }} />
      <Stack.Screen name="add-opening-fund" options={{ title: "Opening fund" }} />
      <Stack.Screen name="add-member-payment" options={{ title: "Member payment" }} />
      <Stack.Screen name="add-reimbursement" options={{ title: "Reimburse" }} />
      <Stack.Screen name="member/[id]" options={{ title: "Member" }} />
      <Stack.Screen name="household/[id]" options={{ title: "Household" }} />
      <Stack.Screen name="report" options={{ title: "Festival report" }} />
      <Stack.Screen name="close-festival" options={{ title: "Close festival" }} />
      <Stack.Screen name="join-requests" options={{ title: "Join requests" }} />
      <Stack.Screen name="permanent-fund" options={{ title: "Permanent Fund" }} />
      <Stack.Screen name="create-festival" options={{ title: "Create festival" }} />
    </Stack>
  );
}

export default function GaneshLayout() {
  return (
    <PrivacyLock>
      <GaneshSessionProvider>
        <GaneshGate>
          <GaneshStack />
        </GaneshGate>
      </GaneshSessionProvider>
    </PrivacyLock>
  );
}
