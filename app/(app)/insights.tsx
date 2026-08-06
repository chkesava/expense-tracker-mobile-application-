import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  BarChart3,
  Bot,
  Calendar,
  Download,
  Search,
} from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { MonthlyAnalyticsView } from "@/components/analytics/MonthlyAnalyticsView";
import { YearlyAnalyticsView } from "@/components/analytics/YearlyAnalyticsView";
import { AnalysisLabView } from "@/components/analytics/AnalysisLabView";
import { ExportDataModal } from "@/components/analytics/ExportDataModal";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type InsightsTab = "analytics" | "yearly" | "search" | "advisor";

export default function InsightsScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const params = useLocalSearchParams<{ tab?: string; q?: string }>();

  const [activeTab, setActiveTab] = useState<InsightsTab>("analytics");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    if (params.tab && ["analytics", "yearly", "search", "advisor"].includes(params.tab)) {
      setActiveTab(params.tab as InsightsTab);
    }
  }, [params.tab]);

  const tabs: PageHeaderTab[] = [
    {
      id: "analytics",
      label: "Analytics",
      icon: <BarChart3 size={16} color={activeTab === "analytics" ? "#FFFFFF" : theme.colors.foreground} />,
    },
    {
      id: "yearly",
      label: "Yearly",
      icon: <Calendar size={16} color={activeTab === "yearly" ? "#FFFFFF" : theme.colors.foreground} />,
    },
    {
      id: "search",
      label: "Search & Lab",
      icon: <Search size={16} color={activeTab === "search" ? "#FFFFFF" : theme.colors.foreground} />,
    },
    {
      id: "advisor",
      label: "AI Advisor",
      icon: <Bot size={16} color={activeTab === "advisor" ? "#FFFFFF" : theme.colors.foreground} />,
    },
  ];

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Insights Hub"
        subtitle="Analytics, Reports & Discovery"
        icon={<BarChart3 size={22} color={theme.colors.primary} />}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as InsightsTab)}
        tabs={tabs}
        rightElement={
          system.allowDataExport ? (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setIsExportModalOpen(true);
              }}
              style={({ pressed }) => [
                styles.exportBtn,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                  borderColor: theme.colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Download size={16} color={theme.colors.foreground} />
            </Pressable>
          ) : undefined
        }
      />

      {/* Monthly Analytics Tab */}
      {activeTab === "analytics" && <MonthlyAnalyticsView />}

      {/* Yearly Analytics Tab */}
      {activeTab === "yearly" && <YearlyAnalyticsView />}

      {/* Analysis Lab & Search Tab */}
      {activeTab === "search" && <AnalysisLabView initialQuery={params.q} />}

      {/* AI Advisor Tab (Phase 16) */}
      {activeTab === "advisor" && (
        <EmptyState
          icon={<Bot size={36} color={theme.colors.mutedForeground} />}
          title="AI Financial Advisor"
          description="Contextual budget insights, anomaly alerts, and AI savings recommendations connect in Phase 16."
        />
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
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
