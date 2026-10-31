import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Activity, BarChart3, Calendar, IdCard, TrendingUp } from "lucide-react-native";

import { EpfDashboard } from "@/components/epf/EpfDashboard";
import { InvestmentsList } from "@/components/investments/InvestmentsList";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { MarketsDashboard } from "@/components/markets/MarketsDashboard";
import { PortfolioDashboard } from "@/components/portfolio/PortfolioDashboard";
import { SipDashboard } from "@/components/sip/SipDashboard";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  INVESTMENT_HUB_TAB_IDS,
  parsePortfolioSubTab,
  type PortfolioSubTabId,
} from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";

export type InvestmentsTab = (typeof INVESTMENT_HUB_TAB_IDS)[number];

export default function InvestmentsScreen() {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { settings: system } = useSystemSettings();
  const params = useLocalSearchParams<{ tab?: string; sub?: string }>();
  const investmentsEnabled = settings.enableInvestments && system.enableInvestments;

  const [activeTab, setActiveTab] = useState<InvestmentsTab>("investments");
  // SPENDLY-645: which Stocks sub-tab to open (from `?sub=` or a Markets shortcut).
  const [stocksSubTab, setStocksSubTab] = useState<PortfolioSubTabId | undefined>(undefined);

  useEffect(() => {
    if (
      params.tab &&
      (INVESTMENT_HUB_TAB_IDS as readonly string[]).includes(params.tab)
    ) {
      setActiveTab(params.tab as InvestmentsTab);
      setStocksSubTab(parsePortfolioSubTab(params.sub) ?? undefined);
    }
  }, [params.tab, params.sub]);

  if (!investmentsEnabled) {
    return <Redirect href="/ledger" />;
  }

  const tabIconColor = (id: InvestmentsTab) =>
    activeTab === id ? theme.colors.primary : theme.colors.mutedForeground;

  const tabs: PageHeaderTab[] = [
    {
      id: "investments",
      label: "Investments",
      icon: <TrendingUp size={16} color={tabIconColor("investments")} />,
    },
    {
      id: "markets",
      label: "Markets",
      icon: <Activity size={16} color={tabIconColor("markets")} />,
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
    {
      id: "epf",
      label: "EPF",
      icon: <IdCard size={16} color={tabIconColor("epf")} />,
    },
  ];

  const isPortfolioTab = activeTab === "portfolio";

  const pageHeader = (
    <PageHeader
      title="Investments"
      subtitle="Holdings, stocks & SIPs"
      icon={
        <TrendingUp size={22} color={theme.colors.primary} />
      }
      activeTab={activeTab}
      onTabChange={(tab) => {
        setStocksSubTab(undefined);
        setActiveTab(tab as InvestmentsTab);
      }}
      tabs={tabs}
      tabVariant="underline"
    />
  );

  return (
    <PageShell
      scrollable={!isPortfolioTab}
      listOwnsBottomInset
      contentContainerStyle={
        isPortfolioTab ? styles.portfolioShell : styles.container
      }
    >
      {isPortfolioTab ? (
        <PortfolioDashboard listHeader={pageHeader} initialSubTab={stocksSubTab} />
      ) : (
        <>
          {pageHeader}
          {activeTab === "investments" ? <InvestmentsList /> : null}
          {activeTab === "markets" ? (
            <MarketsDashboard
              onOpenStocks={(sub) => {
                setStocksSubTab(sub);
                setActiveTab("portfolio");
              }}
            />
          ) : null}
          {activeTab === "sip" ? <SipDashboard /> : null}
          {activeTab === "epf" ? <EpfDashboard /> : null}
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
