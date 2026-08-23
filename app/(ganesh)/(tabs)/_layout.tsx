import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { GaneshTabBar } from "@/components/ganesh/GaneshTabBar";
import { useGaneshSyncReporter } from "@/hooks/useGaneshSyncReporter";
import { usePandals } from "@/hooks/usePandals";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshTabsLayout() {
  const { theme } = useTheme();
  const { ready, pandalId, festivalId } = useGaneshSession();
  const { pandals, loading } = usePandals();
  useGaneshSyncReporter();

  if (!ready || loading) {
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

  if (!pandalId || !festivalId || pandals.length === 0) {
    return <Redirect href={"/(ganesh)/setup" as never} />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <GaneshTabBar
          state={props.state}
          navigation={props.navigation as never}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="collections" options={{ title: "Collections" }} />
      <Tabs.Screen name="expenses" options={{ title: "Expenses" }} />
      <Tabs.Screen name="contributions" options={{ title: "Contributions" }} />
      <Tabs.Screen name="pandal" options={{ title: "Pandal" }} />
    </Tabs>
  );
}
