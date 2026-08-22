import { useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  BarChart3,
  Bot,
  Calendar,
  Download,
  Search,
  TrendingUp,
} from "lucide-react-native";

import { insightAccents } from "@/components/analytics/insightsTheme";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { MonthlyAnalyticsView } from "@/components/analytics/MonthlyAnalyticsView";
import { YearlyAnalyticsView } from "@/components/analytics/YearlyAnalyticsView";
import { AnalysisLabView } from "@/components/analytics/AnalysisLabView";
import { ExportDataModal } from "@/components/analytics/ExportDataModal";
import { AiAdvisorView } from "@/components/ai/AiAdvisorView";
import { haptic } from "@/lib/haptics";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type InsightsTab = "analytics" | "yearly" | "search" | "advisor";

const INSIGHTS_TABS: InsightsTab[] = ["analytics", "yearly", "search", "advisor"];

export default function InsightsScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accents = insightAccents(isDark);
  const { settings: system } = useSystemSettings();
  const params = useLocalSearchParams<{ tab?: string; q?: string }>();

  const [activeTab, setActiveTab] = useState<InsightsTab>("analytics");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const { markScreenVisited } = useSetupProgress();

  useEffect(() => {
    markScreenVisited("insights");
  }, [markScreenVisited]);

  useEffect(() => {
    if (params.tab && INSIGHTS_TABS.includes(params.tab as InsightsTab)) {
      setActiveTab(params.tab as InsightsTab);
    }
  }, [params.tab]);

  const tabIconColor = (tab: InsightsTab) =>
    activeTab === tab ? theme.colors.success : theme.colors.mutedForeground;

  const tabs: PageHeaderTab[] = [
    {
      id: "analytics",
      label: "Analytics",
      icon: <TrendingUp size={16} color={tabIconColor("analytics")} />,
    },
    {
      id: "yearly",
      label: "Yearly",
      icon: <Calendar size={16} color={tabIconColor("yearly")} />,
    },
    {
      id: "search",
      label: "Search & Lab",
      icon: <Search size={16} color={tabIconColor("search")} />,
    },
    {
      id: "advisor",
      label: "AI Advisor",
      icon: <Bot size={16} color={tabIconColor("advisor")} />,
    },
  ];

  const pageHeader = (
    <PageHeader
      title="Insights Hub"
      subtitle="Analytics, Reports & Discoveries"
      icon={<BarChart3 size={22} color={accents.pink} strokeWidth={2.4} />}
      iconBackgroundColor={accents.pinkDim}
      iconBorderColor={
        isDark ? "rgba(244, 63, 94, 0.34)" : "rgba(220, 38, 38, 0.2)"
      }
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as InsightsTab)}
      tabs={tabs}
      tabVariant="underline"
      rightElement={
        system.allowDataExport ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              setIsExportModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Export data"
            style={({ pressed }) => [
              styles.exportBtn,
              {
                backgroundColor: accents.greenDim,
                borderColor: isDark
                  ? "rgba(74, 222, 128, 0.34)"
                  : "rgba(22, 163, 74, 0.24)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Download size={18} color={accents.green} strokeWidth={2.4} />
          </Pressable>
        ) : undefined
      }
    />
  );

  // The Analytics, Yearly and Search dashboards own their own virtualised
  // scroll containers, so the shell must not wrap them in a second ScrollView.
  const ownsScroll = activeTab !== "advisor";

  return (
    <PageShell scrollable={!ownsScroll} contentContainerStyle={styles.container}>
      {activeTab === "analytics" ? (
        <MonthlyAnalyticsView listHeader={pageHeader} />
      ) : activeTab === "yearly" ? (
        <YearlyAnalyticsView listHeader={pageHeader} />
      ) : activeTab === "search" ? (
        <AnalysisLabView initialQuery={params.q} listHeader={pageHeader} />
      ) : (
        <>
          {pageHeader}

          {/* AI Advisor Tab (Phase 16) */}
          <AiAdvisorView />
        </>
      )}

      {/* Export Data Modal */}
      <ExportDataModal
        visible={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  exportBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
