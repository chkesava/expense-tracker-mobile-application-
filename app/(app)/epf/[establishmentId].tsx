import { useEffect, useMemo, useRef, useState } from "react";
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
import { useEpf, useEpfEstablishment } from "@/hooks/useEpf";
import { appDialog } from "@/lib/appDialog";
import type { EpfBackfillRow } from "@/shared/features/epf/types";
import {
  unsavedBackfillSummary,
  unsavedChangesPrompt,
} from "@/shared/features/epf/utils/backfillDraft";
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
  const establishmentKey = Array.isArray(establishmentId)
    ? establishmentId[0]
    : establishmentId;
  const { establishment, loading: establishmentsLoading } =
    useEpfEstablishment(establishmentKey);

  // A live employment opens on Current — that is the month people check.
  const [tab, setTab] = useState<Tab | null>(null);

  /**
   * Backfill bulk-fill state lives here, not in the tab — SPENDLY-1.
   *
   * Tabs are a ternary below, so `EpfBackfillScreen` unmounts on every switch.
   * Owning the typed wage at the route means a tab change no longer loses it at
   * all, which removes the most common way the data-loss bug was triggered
   * without needing a dialog for it.
   */
  const [wage, setWage] = useState("");
  const [epsEligible, setEpsEligible] = useState(true);
  const [prorate, setProrate] = useState(true);
  const [edits, setEdits] = useState<Map<string, EpfBackfillRow>>(new Map());
  const [savedWage, setSavedWage] = useState("");


  // `deriveEmploymentState` rather than `!dateLeft`: the raw check also
  // treated an archived establishment as current employment (KAN-73).
  const isCurrentEmployment = Boolean(
    establishment && deriveEmploymentState(establishment, epfTodayKey()) === "current"
  );

  // Seed the EPS toggle once the establishment resolves. `epsMember` is
  // optional and absent means "is a member", so the default stays true.
  const epsSeeded = useRef(false);
  useEffect(() => {
    if (epsSeeded.current || !establishment) return;
    epsSeeded.current = true;
    setEpsEligible(establishment.epsMember !== false);
  }, [establishment]);
  const activeTab: Tab = tab ?? (isCurrentEmployment ? "current" : "history");
  // Destination picker on Transfers needs the full list; keep it off otherwise
  // so this route does not duplicate the dashboard's EPF listeners (SPENDLY-13).
  const { establishments } = useEpf({ enabled: activeTab === "transfers" });

  const unsavedBackfill = useMemo(
    () => unsavedBackfillSummary({ edits, wage, savedWage }),
    [edits, wage, savedWage]
  );

  /**
   * Leaving Backfill with unsaved bulk work asks first.
   *
   * A `beforeRemove` navigation guard cannot cover this: the tab switch is a
   * ternary inside one route, so no navigation event fires. Applied months are
   * already durable by this point, so only the in-memory bulk fill is at risk —
   * which is why "Discard" here is safe.
   */
  const changeTab = (next: Tab) => {
    if (activeTab !== "backfill" || next === "backfill" || !unsavedBackfill.dirty) {
      setTab(next);
      return;
    }

    const prompt = unsavedChangesPrompt(unsavedBackfill);
    appDialog.alert(prompt.title, prompt.message, [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          setWage("");
          setSavedWage("");
          setEdits(new Map());
          setTab(next);
        },
      },
    ]);
  };

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
                  onPress={() => changeTab(item.id)}
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
              onAddMonths={() => changeTab("backfill")}
            />
          ) : (
            <EpfBackfillScreen
              establishment={establishment}
              draft={{
                wage,
                setWage,
                epsEligible,
                setEpsEligible,
                prorate,
                setProrate,
                edits,
                setEdits,
                savedWage,
                setSavedWage,
              }}
            />
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
