import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Plus, Wallet } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Section } from "@/components/dashboard/primitives";
import { CreateInvestmentModal } from "@/components/investments/CreateInvestmentModal";
import { InvestmentCard } from "@/components/investments/InvestmentCard";
import { InvestmentDetailModal } from "@/components/investments/InvestmentDetailModal";
import { useOpenFromRouteParam } from "@/hooks/useOpenFromRouteParam";
import { useInvestments } from "@/hooks/useInvestments";
import type { Investment, InvestmentKind } from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import {
  formatSignedPercent,
  investmentReturnPercent,
} from "@/shared/utils/investmentPresentation";
import { useTheme } from "@/theme/ThemeProvider";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

import { SearchBar } from "@/components/common/SearchBar";
import { Chip } from "@/components/ui/Chip";
type FilterTab = "all" | InvestmentKind;

export function InvestmentsList() {
  const { theme } = useTheme();
  const displayCurrency = useDisplayCurrency();

  const {
    investments,
    loading,
    addInvestment,
    closeInvestment,
    deleteInvestment,
  } = useInvestments();

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedInvestment, setSelectedInvestment] =
    useState<Investment | null>(null);

  // SPENDLY-181: `/investments?tab=investments&id=…` opens this investment's detail.
  useOpenFromRouteParam(!loading, (id) => {
    const found = investments.find((i) => i.id === id);
    if (found) setSelectedInvestment(found);
    return Boolean(found);
  });

  const today = todayDateKey();

  // Portfolio Totals calculation
  const portfolioSummary = useMemo(() => {
    let totalPrincipal = 0;
    let totalCurrentValue = 0;

    investments.forEach((inv) => {
      if (inv.status === "active") {
        const val = getInvestmentValuation(inv, today);
        totalPrincipal += inv.principal;
        totalCurrentValue += val.totalValue;
      }
    });

    const netGain = totalCurrentValue - totalPrincipal;
    const gainPct = investmentReturnPercent(netGain, totalPrincipal);

    return {
      totalPrincipal,
      totalCurrentValue,
      netGain,
      gainPct,
      activeCount: investments.filter((i) => i.status === "active").length,
    };
  }, [investments, today]);

  const filteredInvestments = useMemo(() => {
    return investments.filter((inv) => {
      if (activeFilter !== "all" && inv.kind !== activeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return inv.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [investments, activeFilter, searchQuery]);

  return (
    <View style={styles.container}>
      {/* Portfolio Overview Card */}
      {investments.length > 0 && (
        <Section
          title="Deposits & funds"
          subtitle={`${portfolioSummary.activeCount} active`}
          icon={<Wallet size={16} color={theme.colors.primary} />}
        >
          <View style={styles.summaryTop}>
            <View style={styles.summaryCol}>
              <MetaLabel>Current value</MetaLabel>
              <FinancialAmount
                value={portfolioSummary.totalCurrentValue}
                currency={displayCurrency}
                size="xl"
                weight="bold"
                fit
              />
            </View>

            <View style={[styles.summaryCol, styles.summaryEnd]}>
              <MetaLabel>Net return</MetaLabel>
              {/* SPENDLY-542: the old line always printed "+", so a loss read
                  "+INR -500 (+-3.2%)". */}
              <FinancialAmount
                value={Math.round(portfolioSummary.netGain)}
                currency={displayCurrency}
                size="md"
                sign="auto"
                tone="auto"
                weight="semibold"
              />
              {portfolioSummary.gainPct !== null ? (
                <Text
                  style={[
                    styles.summaryPct,
                    {
                      color: theme.colors.mutedForeground,
                      fontFamily: theme.fontFamily.medium,
                    },
                  ]}
                >
                  {formatSignedPercent(portfolioSummary.gainPct)} on principal
                </Text>
              ) : null}
            </View>
          </View>
        </Section>
      )}

      {/* Filter Tabs & Add Button */}
      <View style={styles.filterRow}>
        <HorizontalSwipeBoundary>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {[
              { id: "all", label: "All Assets" },
              { id: "fixed_deposit", label: "Fixed Deposits" },
              { id: "interest_savings", label: "Savings" },
              { id: "mutual_fund", label: "Mutual Funds" },
            ].map((tab) => {
              const isActive = activeFilter === tab.id;
              return (
                <Chip
                  key={tab.id}
                  label={tab.label}
                  selected={isActive}
                  appearance="outline"
                  accessibilityRole="tab"
                  onPress={() => setActiveFilter(tab.id as FilterTab)}
                />
              );
            })}
          </ScrollView>
        </HorizontalSwipeBoundary>
      </View>

      {/* Search Input */}
      {investments.length > 2 && (
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search investment assets..."
          accessibilityLabel="Search investments"
        />
      )}

      {/* Investment Asset Cards */}
      {loading ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <DashboardSkeleton variant="hero" />
          <DashboardSkeleton variant="section" rows={3} />
        </View>
      ) : filteredInvestments.length === 0 ? (
        <EmptyState
          illustration="investments"
          title={searchQuery ? "No Investments Found" : "No Investments Tracked"}
          description={
            searchQuery
              ? "Try adjusting your search query or clearing filters."
              : "Track Fixed Deposits, Mutual Funds, Gold, and calculate compounding portfolio returns."
          }
          primaryAction={{
            label: "Add Investment",
            icon: <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />,
            onPress: () => setIsCreateModalOpen(true),
          }}
          secondaryAction={
            searchQuery
              ? {
                  label: "Clear Search",
                  onPress: () => setSearchQuery(""),
                }
              : undefined
          }
          tip="Categorizing assets by liquidity helps calculate your true emergency fund runway."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filteredInvestments.map((inv) => (
            <InvestmentCard
              key={inv.id}
              investment={inv}
              currency={displayCurrency}
              onPress={() => setSelectedInvestment(inv)}
            />
          ))}
        </View>
      )}

      {/* Modals */}
      <CreateInvestmentModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={addInvestment}
      />

      <InvestmentDetailModal
        visible={!!selectedInvestment}
        investment={selectedInvestment}
        currency={displayCurrency}
        onClose={() => setSelectedInvestment(null)}
        onCloseInvestment={closeInvestment}
        onDeleteInvestment={deleteInvestment}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryCol: {
    gap: 3,
    flexShrink: 1,
  },
  summaryEnd: {
    alignItems: "flex-end",
  },
  summaryPct: {
    fontSize: 12,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
