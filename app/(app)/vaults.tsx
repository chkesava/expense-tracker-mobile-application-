import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  FolderPlus,
  Plus,
  Search,
  Shield,
  Users,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CreateVaultModal } from "@/components/vaults/CreateVaultModal";
import { VaultCard } from "@/components/vaults/VaultCard";
import { VaultDetailModal } from "@/components/vaults/VaultDetailModal";
import { useVaults } from "@/hooks/useVaults";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { SharedVault, VaultStats } from "@/shared/types/vault";
import { calculateVaultStats } from "@/shared/utils/vaultMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function VaultsScreen() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { vaults, loading, createVault, deleteVault } = useVaults();

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

  // Aggregate stats across all vaults
  const aggregateStats = useMemo(() => {
    const totalBudget = vaults.reduce((sum, v) => sum + (v.budget || 0), 0);
    return {
      vaultCount: vaults.length,
      totalBudget,
    };
  }, [vaults]);

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Shared Vaults"
        subtitle="Collaborative Group Budgets"
        icon={<Users size={22} color={theme.colors.primary} />}
        rightElement={
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
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
        }
      />

      {/* Aggregate Overview Card */}
      {vaults.length > 0 && (
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
                currency={system.defaultCurrency}
                style={{ fontSize: 18, fontWeight: "900", color: theme.colors.primary }}
              />
            </View>
          </View>
        </Card>
      )}

      {/* Search Bar */}
      {vaults.length > 2 && (
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
      )}

      {/* Vault List / Empty State */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
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
            // Default initial stats calculation
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

      {/* Create Vault Modal */}
      <CreateVaultModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={createVault}
      />

      {/* Vault Detail Sheet */}
      <VaultDetailModal
        visible={!!selectedVault}
        vault={selectedVault}
        onClose={() => setSelectedVault(null)}
        onDeleteVault={deleteVault}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingBottom: 32,
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
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
