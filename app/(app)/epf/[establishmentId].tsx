import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { EpfBackfillScreen } from "@/components/epf/EpfBackfillScreen";
import { EpfBalanceTab } from "@/components/epf/EpfBalanceTab";
import { EpfContributionHistory } from "@/components/epf/EpfContributionHistory";
import { EpfCurrentContributions } from "@/components/epf/EpfCurrentContributions";
import { EpfTransfersList } from "@/components/epf/EpfTransfersList";
import { useEpf } from "@/hooks/useEpf";
import { deriveEmploymentState, maskIdentifier } from "@/shared/features/epf/utils";
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import { useTheme } from "@/theme/ThemeProvider";

type Tab = "balance" | "current" | "history" | "backfill" | "transfers";

/**
 * Contributions for one establishment — KAN-66.
 *
 * A route rather than a modal: a long backfill is work someone leaves and comes
 * back to, and a URL is what makes that real. Mirrors the
 * `credit-card-bills/[id]` precedent.
 */
export default function EpfEstablishmentContributionsScreen() {
  const { establishmentId } = useLocalSearchParams<{ establishmentId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { establishments, establishmentsLoading } = useEpf();

  // A live employment opens on Current — that is the month people check.
  const [tab, setTab] = useState<Tab | null>(null);

  const establishment = useMemo(
    () => establishments.find((item) => item.id === establishmentId),
    [establishments, establishmentId]
  );

  // `deriveEmploymentState` rather than `!dateLeft`: the raw check also
  // treated an archived establishment as current employment (KAN-73).
  const isCurrentEmployment = Boolean(
    establishment && deriveEmploymentState(establishment, epfTodayKey()) === "current"
  );
  const activeTab: Tab = tab ?? (isCurrentEmployment ? "current" : "history");

  const tabs: { id: Tab; label: string }[] = [
    { id: "balance", label: "Balance" },
    ...(isCurrentEmployment ? ([{ id: "current", label: "Current" }] as const) : []),
    { id: "history", label: "History" },
    { id: "backfill", label: "Backfill" },
    { id: "transfers", label: "Transfers" },
  ];

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={theme.iconSize.lg} color={theme.colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.foreground }]} numberOfLines={1}>
            {establishment?.employerName ?? "Contributions"}
          </Text>
          {establishment ? (
            <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
              {maskIdentifier(establishment.memberId)} · {establishment.dateJoined} –{" "}
              {establishment.dateLeft ?? "Present"}
            </Text>
          ) : null}
        </View>
      </View>

      {establishmentsLoading ? (
        <View style={styles.body}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : !establishment ? (
        <View style={styles.body}>
          <EmptyState
            title="Establishment not found"
            description="This employer may have been removed. Go back and pick another one."
            primaryAction={{ label: "Go back", onPress: () => router.back() }}
          />
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.tabsScroll, { borderBottomColor: theme.colors.border }]}
            contentContainerStyle={styles.tabs}
          >
            {tabs.map((item) => {
              const active = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setTab(item.id)}
                  style={[
                    styles.tab,
                    active && { borderBottomColor: theme.colors.primary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color: active
                          ? theme.colors.primary
                          : theme.colors.mutedForeground,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {activeTab === "balance" ? (
            <EpfBalanceTab establishment={establishment} />
          ) : activeTab === "current" ? (
            <EpfCurrentContributions establishment={establishment} />
          ) : activeTab === "transfers" ? (
            <EpfTransfersList
              establishment={establishment}
              establishments={establishments}
            />
          ) : activeTab === "history" ? (
            <EpfContributionHistory
              establishment={establishment}
              onAddMonths={() => setTab("backfill")}
            />
          ) : (
            <EpfBackfillScreen establishment={establishment} />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 12 },
  body: { gap: 12, padding: 16 },
  tabsScroll: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontWeight: "600" },
});
