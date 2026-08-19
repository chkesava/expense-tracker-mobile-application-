import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { BarChart3, Calendar, TrendingUp } from "lucide-react-native";

import { InvestmentsList } from "@/components/investments/InvestmentsList";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { PortfolioDashboard } from "@/components/portfolio/PortfolioDashboard";
import { SipDashboard } from "@/components/sip/SipDashboard";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { INVESTMENT_HUB_TAB_IDS } from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type InvestmentsTab = (typeof INVESTMENT_HUB_TAB_IDS)[number];

export default function InvestmentsScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  const params = useLocalSearchParams<{ tab?: string }>();
  const investmentsEnabled = settings.enableInvestments && system.enableInvestments;

  const [activeTab, setActiveTab] = useState<InvestmentsTab>("investments");

  useEffect(() => {
    if (
      params.tab &&
      (INVESTMENT_HUB_TAB_IDS as readonly string[]).includes(params.tab)
    ) {
      setActiveTab(params.tab as InvestmentsTab);
    }
  }, [params.tab]);

  if (!investmentsEnabled) {
    return <Redirect href="/ledger" />;
  }

  const tabIconColor = (id: InvestmentsTab) =>
    activeTab === id ? theme.colors.success : theme.colors.mutedForeground;

  const tabs: PageHeaderTab[] = [
    {
      id: "investments",
      label: "Investments",
      icon: <TrendingUp size={16} color={tabIconColor("investments")} />,
    },
    {
      id: "portfolio",
      label: "Stocks",
      icon: <BarChart3 size={16} color={tabIconColor("portfolio")} />,
    },
    {
      id: "sip",
      label: "Virtual SIPs",
      icon: <Calendar size={16} color={tabIconColor("sip")} />,
    },
  ];

  const isPortfolioTab = activeTab === "portfolio";

  const pageHeader = (
    <PageHeader
      title="Investments"
      subtitle="Holdings, stocks & SIPs"
      icon={
        <TrendingUp
          size={22}
          color={isDark ? "#FFFFFF" : theme.colors.success}
        />
      }
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as InvestmentsTab)}
      tabs={tabs}
      tabVariant="underline"
    />
  );

  return (
    <PageShell
      scrollable={!isPortfolioTab}
      contentContainerStyle={
        isPortfolioTab ? styles.portfolioShell : styles.container
      }
    >
      {isPortfolioTab ? (
        <PortfolioDashboard listHeader={pageHeader} />
      ) : (
        <>
          {pageHeader}
          {activeTab === "investments" ? <InvestmentsList /> : null}
          {activeTab === "sip" ? <SipDashboard /> : null}
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 40,
  },
  portfolioShell: {
    flex: 1,
    minHeight: 0,
  },
});
