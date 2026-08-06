import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Banknote,
  Landmark,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CreateInvestmentModal } from "@/components/investments/CreateInvestmentModal";
import { InvestmentCard } from "@/components/investments/InvestmentCard";
import { InvestmentDetailModal } from "@/components/investments/InvestmentDetailModal";
import { useInvestments } from "@/hooks/useInvestments";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Investment, InvestmentKind } from "@/shared/types/investment";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

type FilterTab = "all" | InvestmentKind;

export function InvestmentsList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

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

  const today = new Date().toISOString().slice(0, 10);

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
    const gainPct =
      totalPrincipal > 0 ? ((netGain / totalPrincipal) * 100).toFixed(1) : "0.0";

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
        <Card style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
                PORTFOLIO VALUE (ASSETS)
              </Text>
              <Amount
                value={portfolioSummary.totalCurrentValue}
                currency={system.defaultCurrency}
                style={{
                  fontSize: 22,
                  fontWeight: "900",
                  color: theme.colors.foreground,
                }}
              />
            </View>

            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
                NET RETURN
              </Text>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: portfolioSummary.netGain >= 0 ? "#10B981" : "#EF4444",
                }}
              >
                +{system.defaultCurrency} {Math.round(portfolioSummary.netGain).toLocaleString()} (+{portfolioSummary.gainPct}%)
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Filter Tabs & Add Button */}
      <View style={styles.filterRow}>
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
              <Pressable
                key={tab.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setActiveFilter(tab.id as FilterTab);
                }}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive
                      ? theme.colors.primary
                      : isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    {
                      color: isActive ? "#FFFFFF" : theme.colors.foreground,
                      fontWeight: isActive ? "700" : "500",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Search Input */}
      {investments.length > 2 && (
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Search size={16} color={theme.colors.mutedForeground} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search investment assets..."
            placeholderTextColor={theme.colors.mutedForeground}
            style={[styles.searchInput, { color: theme.colors.foreground }]}
          />
        </View>
      )}

      {/* Investment Asset Cards */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : filteredInvestments.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={40} color={theme.colors.mutedForeground} />}
          title={searchQuery ? "No investments found" : "No Investments Logged"}
          description={
            searchQuery
              ? "Try adjusting your search filter"
              : "Track Fixed Deposits, High-Yield Savings, and Mutual Funds with real-time accrued returns."
          }
          action={
            <Button
              onPress={() => setIsCreateModalOpen(true)}
              style={{ marginTop: 8 }}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={{ marginLeft: 6, color: "#FFFFFF", fontWeight: "700" }}>
                Add First Investment
              </Text>
            </Button>
          }
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filteredInvestments.map((inv) => (
            <InvestmentCard
              key={inv.id}
              investment={inv}
              currency={system.defaultCurrency}
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
        currency={system.defaultCurrency}
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
  summaryCard: {
    padding: 16,
    borderRadius: 18,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
