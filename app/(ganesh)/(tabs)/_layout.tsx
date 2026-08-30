import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

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

  if (!ready) {
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

  if (!pandalId || !festivalId) {
    return <Redirect href={"/(ganesh)/setup" as never} />;
  }

  const hasActivePandal = pandals.some((item) => item.id === pandalId);
  if (!loading && (pandals.length === 0 || !hasActivePandal)) {
    return <Redirect href={"/(ganesh)/setup" as never} />;
  }

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      tabBar={(props) => (
        <GaneshTabBar
          state={props.state}
          navigation={props.navigation as never}
        />
      )}
      screenOptions={{ headerShown: false }}
    >
      {/*
        Declaration order is display order: `GaneshTabBar` filters the
        navigator's routes, so the five visible destinations come first.

        The four below them stay registered but are absent from the bar, so
        every existing link — `/(ganesh)/(tabs)/expenses`,
        `/(ganesh)/(tabs)/contributions?status=promised` — keeps resolving.
        They are reached from the Funds and People hubs instead.
      */}
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="seva" options={{ title: "Seva" }} />
      <Tabs.Screen name="funds" options={{ title: "Funds" }} />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="pandal" options={{ title: "Pandal" }} />

      <Tabs.Screen name="collections" options={{ title: "Collections" }} />
      <Tabs.Screen name="expenses" options={{ title: "Expenses" }} />
      <Tabs.Screen name="contributions" options={{ title: "Contributions" }} />
      <Tabs.Screen name="committee" options={{ title: "Committee" }} />
    </Tabs>
      {loading || !hasActivePandal ? (
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
    </View>
  );
}
