import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  BarChart3,
  Bot,
  Calendar,
  PieChart,
  Search,
  Sparkles,
} from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/theme/ThemeProvider";

export type InsightsTab = "analytics" | "yearly" | "search" | "advisor";

export default function InsightsScreen() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<InsightsTab>("analytics");

  const tabs: PageHeaderTab[] = [
    { id: "analytics", label: "Analytics", icon: <BarChart3 size={16} color={theme.colors.foreground} /> },
    { id: "yearly", label: "Yearly", icon: <Calendar size={16} color={theme.colors.foreground} /> },
    { id: "search", label: "Search", icon: <Search size={16} color={theme.colors.foreground} /> },
    { id: "advisor", label: "AI Advisor", icon: <Bot size={16} color={theme.colors.foreground} /> },
  ];

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Insights Hub"
        subtitle="Analytics & Financial Reports"
        icon={<BarChart3 size={22} color={theme.colors.primary} />}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as InsightsTab)}
        tabs={tabs}
      />

      {activeTab === "analytics" && (
        <EmptyState
          icon={<PieChart size={36} color={theme.colors.mutedForeground} />}
          title="Monthly Analytics"
          description="Visual category breakdown charts, spend trajectories, and monthly comparison graphs connect in Phase 11."
        />
      )}

      {activeTab === "yearly" && (
        <EmptyState
          icon={<Calendar size={36} color={theme.colors.mutedForeground} />}
          title="Year in Review"
          description="Annual expense trends, month-by-month cashflow, and year-end summaries connect in Phase 11."
        />
      )}

      {activeTab === "search" && (
        <EmptyState
          icon={<Search size={36} color={theme.colors.mutedForeground} />}
          title="Global Search & Filter"
          description="Deep multi-attribute search across all historical transactions connects in Phase 11."
        />
      )}

      {activeTab === "advisor" && (
        <EmptyState
          icon={<Bot size={36} color={theme.colors.mutedForeground} />}
          title="AI Financial Advisor"
          description="Contextual budget insights, anomaly alerts, and AI savings recommendations connect in Phase 18."
        />
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
});
