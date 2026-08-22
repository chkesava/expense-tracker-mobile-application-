import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  HandCoins,
  LayoutGrid,
  Plane,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { CollectList } from "@/components/collect/CollectList";
import { SpacesList } from "@/components/spaces/SpacesList";
import { SplitsList } from "@/components/splits/SplitsList";
import { TripsList } from "@/components/trips/TripsList";
import { PageHeader, type PageHeaderTab } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui/Card";
import { CreateVaultModal } from "@/components/vaults/CreateVaultModal";
import { VaultCard } from "@/components/vaults/VaultCard";
import { VaultDetailModal } from "@/components/vaults/VaultDetailModal";
import { useVaults } from "@/hooks/useVaults";
import {
  VAULT_HUB_TAB_IDS,
} from "@/shared/config/navigation";
import type { SharedVault, VaultStats } from "@/shared/types/vault";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

export type VaultsTab = (typeof VAULT_HUB_TAB_IDS)[number];

export default function VaultsScreen() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<VaultsTab>("shared");

  useEffect(() => {
    if (params.tab && (VAULT_HUB_TAB_IDS as readonly string[]).includes(params.tab)) {
      setActiveTab(params.tab as VaultsTab);
    }
  }, [params.tab]);

  const tabIconColor = (id: VaultsTab) =>
    activeTab === id ? theme.colors.success : theme.colors.mutedForeground;

  const tabs: PageHeaderTab[] = [
    {
      id: "shared",
      label: "Shared Vaults",
      icon: <Shield size={16} color={tabIconColor("shared")} />,
    },
    {
      id: "spaces",
      label: "Spaces",
      icon: <LayoutGrid size={16} color={tabIconColor("spaces")} />,
    },
    {
      id: "splits",
      label: "Splits",
      icon: <Users size={16} color={tabIconColor("splits")} />,
    },
    {
      id: "travel",
      label: "Travel",
      icon: <Plane size={16} color={tabIconColor("travel")} />,
    },
    {
      id: "collect",
      label: "Collect",
      icon: <HandCoins size={16} color={tabIconColor("collect")} />,
    },
  ];

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Vaults"
        subtitle="Shared money, spaces & splits"
        icon={<Shield size={22} color={theme.colors.primary} />}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as VaultsTab)}
        tabs={tabs}
        tabVariant="underline"
      />

      {activeTab === "shared" ? <SharedVaultsPanel /> : null}
      {activeTab === "spaces" ? <SpacesList /> : null}
      {activeTab === "splits" ? <SplitsList /> : null}
      {activeTab === "travel" ? <TripsList /> : null}
      {activeTab === "collect" ? <CollectList /> : null}
    </PageShell>
  );
}

function SharedVaultsPanel() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const displayCurrency = useDisplayCurrency();

  const { vaults, loading, error, retry, createVault, deleteVault } = useVaults();

  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedVault, setSelectedVault] = useState<SharedVault | null>(null);

  const filteredVaults = useMemo(() => {
    if (!searchQuery.trim()) return vaults;
    const q = searchQuery.toLowerCase();
    return vaults.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q)
    );
  }, [vaults, searchQuery]);

  const aggregateStats = useMemo(() => {
    const totalBudget = vaults.reduce((sum, v) => sum + (v.budget || 0), 0);
    return {
      vaultCount: vaults.length,
      totalBudget,
    };
  }, [vaults]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeaderRow}>
        <Pressable
          onPress={() => {
            haptic.selection().catch(() => undefined);
            setIsCreateModalOpen(true);
          }}
          style={({ pressed }) => [
            styles.headerActionBtn,
            {
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={styles.headerActionText}>Create</Text>
        </Pressable>
      </View>

      {vaults.length > 0 ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBlock}>
              <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
                ACTIVE VAULTS
              </Text>
              <Text style={[styles.summaryValue, { color: theme.colors.foreground }]}>
                {aggregateStats.vaultCount} Space{aggregateStats.vaultCount === 1 ? "" : "s"}
              </Text>
            </View>

            <View style={[styles.summaryBlock, { alignItems: "flex-end" }]}>
              <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
                TOTAL ALLOCATED BUDGET
              </Text>
              <Amount
                value={aggregateStats.totalBudget}
                currency={displayCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: theme.colors.primary }}
              />
            </View>
          </View>
        </Card>
      ) : null}

      {vaults.length > 2 ? (
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
            placeholder="Search vaults by name..."
            placeholderTextColor={theme.colors.mutedForeground}
            style={[styles.searchInput, { color: theme.colors.foreground }]}
          />
        </View>
      ) : null}

      {loading ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : error ? (
        <ErrorState
          title="Couldn't load your vaults"
          description={error.message}
          onRetry={error.retryable ? retry : undefined}
        />
      ) : filteredVaults.length === 0 ? (
        <EmptyState
          illustration="vaults"
          title={searchQuery ? "No Vaults Match Search" : "No Shared Vaults Yet"}
          description={
            searchQuery
              ? "Try adjusting or clearing your search terms."
              : "Create collaborative vaults with your partner, roommates, or family for joint budgets."
          }
          primaryAction={{
            label: "Create First Vault",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
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
          tip="Shared vaults isolate group expenses without exposing your personal private bank accounts."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {filteredVaults.map((vault) => {
            const initialStats: VaultStats = {
              totalDeposits: 0,
              totalWithdrawals: 0,
              currentBalance: 0,
              budget: vault.budget || 0,
              budgetUsagePercent: 0,
              remainingBudget: vault.budget || 0,
              transactionCount: 0,
              status: "healthy",
            };

            return (
              <VaultCard
                key={vault.id}
                vault={vault}
                stats={initialStats}
                onPress={() => setSelectedVault(vault)}
              />
            );
          })}
        </View>
      )}

      <CreateVaultModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={createVault}
      />

      <VaultDetailModal
        visible={!!selectedVault}
        vault={selectedVault}
        onClose={() => setSelectedVault(null)}
        onDeleteVault={deleteVault}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 32,
  },
  panel: {
    gap: 16,
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
  },
  headerActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  summaryCard: {
    padding: 18,
    borderRadius: 20,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryBlock: {
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 19,
    fontWeight: "900",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
});
