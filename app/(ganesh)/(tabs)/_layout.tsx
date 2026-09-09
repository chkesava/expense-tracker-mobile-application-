import { useEffect } from "react";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { GANESH_TAB_LABEL_KEYS } from "@/components/ganesh/i18n/ganeshTabs";
import { GaneshTabBar } from "@/components/ganesh/GaneshTabBar";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshSyncReporter } from "@/hooks/useGaneshSyncReporter";
import { usePandals } from "@/hooks/usePandals";
import { useGaneshT } from "@/providers/GaneshI18nProvider";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { resolveSessionFestival } from "@/shared/utils/ganeshFestivalSession";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshTabsLayout() {
  const { theme } = useTheme();
  const t = useGaneshT();
  const { ready, pandalId, festivalId, clearSession, setSession } = useGaneshSession();
  const { loading, membershipsReady, sessionMembershipActive } = usePandals();
  const { festivals, loading: festivalsLoading } = useFestivals(pandalId);
  useGaneshSyncReporter();

  const hasActivePandal = sessionMembershipActive;
  const festivalResolution = resolveSessionFestival(
    festivalId,
    festivals,
    !festivalsLoading
  );
  const switchingFestival = festivalResolution.action === "switch";

  useEffect(() => {
    if (!ready || !membershipsReady || !pandalId) return;
    if (!hasActivePandal) {
      void clearSession();
      return;
    }
    if (festivalsLoading) return;
    const resolved = resolveSessionFestival(festivalId, festivals, true);
    if (resolved.action === "switch") {
      void setSession({ pandalId, festivalId: resolved.festivalId });
    }
  }, [
    ready,
    loading,
    membershipsReady,
    pandalId,
    festivalId,
    festivals,
    festivalsLoading,
    hasActivePandal,
    clearSession,
    setSession,
  ]);

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
    return <Redirect href={"/(ganesh)/setup"} />;
  }

  if (membershipsReady && !hasActivePandal) {
    return <Redirect href={"/(ganesh)/setup"} />;
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
      <Tabs.Screen name="index" options={{ title: t(GANESH_TAB_LABEL_KEYS.index) }} />
      <Tabs.Screen name="seva" options={{ title: t(GANESH_TAB_LABEL_KEYS.seva) }} />
      <Tabs.Screen name="funds" options={{ title: t(GANESH_TAB_LABEL_KEYS.funds) }} />
      <Tabs.Screen name="people" options={{ title: t(GANESH_TAB_LABEL_KEYS.people) }} />
      <Tabs.Screen name="pandal" options={{ title: t(GANESH_TAB_LABEL_KEYS.pandal) }} />

      <Tabs.Screen name="collections" options={{ title: t(GANESH_TAB_LABEL_KEYS.collections) }} />
      <Tabs.Screen name="expenses" options={{ title: t(GANESH_TAB_LABEL_KEYS.expenses) }} />
      <Tabs.Screen name="contributions" options={{ title: t(GANESH_TAB_LABEL_KEYS.contributions) }} />
      <Tabs.Screen name="committee" options={{ title: t(GANESH_TAB_LABEL_KEYS.committee) }} />
    </Tabs>
      {loading || !hasActivePandal || festivalsLoading || switchingFestival ? (
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
