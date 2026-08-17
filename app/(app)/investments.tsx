import { useEffect, useState } from "react";
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

export type InvestmentsTab = (typeof INVESTMENT_HUB_TAB_IDS)[number];

export default function InvestmentsScreen() {
  const { theme } = useTheme();
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

  return (
    <PageShell contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
      <PageHeader
        title="Investments"
        subtitle="Holdings, stocks & SIPs"
        icon={<TrendingUp size={22} color={theme.colors.success} />}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as InvestmentsTab)}
        tabs={tabs}
        tabVariant="underline"
      />

      {activeTab === "investments" ? <InvestmentsList /> : null}
      {activeTab === "portfolio" ? <PortfolioDashboard /> : null}
      {activeTab === "sip" ? <SipDashboard /> : null}
    </PageShell>
  );
}
