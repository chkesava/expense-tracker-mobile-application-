import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Plus,
  Users,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { CreateSplitModal } from "@/components/splits/CreateSplitModal";
import { SplitDetailModal } from "@/components/splits/SplitDetailModal";
import { useAuth } from "@/providers/AuthProvider";
import { useSplits } from "@/hooks/useSplits";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Split } from "@/shared/types/split";
import {
  computeSplitProgress,
  computeSplitSummary,
} from "@/shared/utils/splitMath";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function SplitsList() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const { settings: system } = useSystemSettings();
  const { splits, loading } = useSplits();

  const [activeTab, setActiveTab] = useState<"active" | "settled">("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSplit, setSelectedSplit] = useState<Split | null>(null);

  const summary = useMemo(() => {
    return computeSplitSummary(splits, user?.uid || "");
  }, [splits, user?.uid]);

  const filteredSplits = useMemo(() => {
    return splits.filter((s) => {
      const progress = computeSplitProgress(s);
      const isSettled = s.settled || progress.isFullySettled;
      return activeTab === "settled" ? isSettled : !isSettled;
    });
  }, [splits, activeTab]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero Debt Banner */}
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.35 : 0.08,
            shadowRadius: 16,
            elevation: 6,
          },
        ]}
      >
        <View style={styles.heroHeader}>
          <Text
            style={[styles.heroSubtitle, { color: theme.colors.mutedForeground }]}
          >
            GROUP BALANCES & DEBT
          </Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              setIsCreateOpen(true);
            }}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: theme.colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Plus size={14} color={theme.colors.primaryForeground} strokeWidth={2.5} />
            <Text
              style={[
                styles.addBtnText,
                { color: theme.colors.primaryForeground },
              ]}
            >
              Split Bill
            </Text>
          </Pressable>
        </View>

        {/* Debt Split Row */}
        <View style={styles.debtRow}>
          <View style={styles.debtItem}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ArrowDownLeft size={14} color="#22C55E" />
              <Text style={[styles.debtLabel, { color: theme.colors.mutedForeground }]}>
                You are owed
              </Text>
            </View>
            <Amount
              value={summary.totalOwedToYou}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: 20, fontWeight: "900", color: "#22C55E" }}
            />
          </View>

          <View
            style={[
              styles.debtDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.debtItem}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ArrowUpRight size={14} color="#F59E0B" />
              <Text style={[styles.debtLabel, { color: theme.colors.mutedForeground }]}>
                You owe
              </Text>
            </View>
            <Amount
              value={summary.totalYouOwe}
              currency={system.defaultCurrency}
              ghostable
              style={{ fontSize: 20, fontWeight: "900", color: "#F59E0B" }}
            />
          </View>
        </View>
      </View>

      {/* Tabs / Filter Pills */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setActiveTab("active");
          }}
          style={[
            styles.filterPill,
            activeTab === "active"
              ? { backgroundColor: theme.colors.primary }
              : {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              {
                color:
                  activeTab === "active"
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground,
                fontWeight: activeTab === "active" ? "700" : "500",
              },
            ]}
          >
            Active ({summary.activeCount})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setActiveTab("settled");
          }}
          style={[
            styles.filterPill,
            activeTab === "settled"
              ? { backgroundColor: theme.colors.primary }
              : {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                },
          ]}
        >
          <Text
            style={[
              styles.filterPillText,
              {
                color:
                  activeTab === "settled"
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground,
                fontWeight: activeTab === "settled" ? "700" : "500",
              },
            ]}
          >
            Settled ({summary.settledCount})
          </Text>
        </Pressable>
      </View>

      {/* Splits List */}
      {filteredSplits.length === 0 ? (
        <EmptyState
          illustration="splits"
          title="No Split Bills Yet"
          description="Split group dinners, house rent, or shared trips with friends and track settlements in real-time."
          primaryAction={{
            label: "Create First Split",
            icon: <Plus size={16} color="#FFFFFF" strokeWidth={2.4} />,
            onPress: () => setIsCreateOpen(true),
          }}
          tip="Split balances update automatically as participants settle up their share."
        />
      ) : (
        <View style={styles.listContainer}>
          {filteredSplits.map((split) => {
            const progress = computeSplitProgress(split);
            const isOrganizer = split.createdBy === user?.uid;

            return (
              <Pressable
                key={split.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => undefined);
                  setSelectedSplit(split);
                }}
                style={({ pressed }) => [
                  styles.splitCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <View style={styles.splitTopRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.categoryBadgeRow}>
                      <View
                        style={[
                          styles.categoryBadge,
                          { backgroundColor: "rgba(107, 99, 255, 0.15)" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryBadgeText,
                            { color: theme.colors.primary },
                          ]}
                        >
                          {split.category || "GENERAL"}
                        </Text>
                      </View>

                      {progress.isFullySettled || split.settled ? (
                        <View
                          style={[
                            styles.settledBadge,
                            { backgroundColor: "rgba(34, 197, 94, 0.15)" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.settledBadgeText,
                              { color: "#22C55E" },
                            ]}
                          >
                            SETTLED
                          </Text>
                        </View>
                      ) : (
                        <Text
                          style={{
                            fontSize: 10,
                            color: theme.colors.mutedForeground,
                            fontWeight: "600",
                          }}
                        >
                          {progress.unpaidCount} unpaid
                        </Text>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.splitTitle,
                        { color: theme.colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {split.title}
                    </Text>

                    <Text
                      style={[
                        styles.splitMeta,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      {split.participants.length} participants · {isOrganizer ? "Organized by you" : `By ${split.createdByName || "Friend"}`}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Amount
                      value={split.totalAmount}
                      currency={system.defaultCurrency}
                      ghostable
                      style={{
                        fontSize: theme.typography.md,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: progress.isFullySettled
                          ? "#22C55E"
                          : theme.colors.primary,
                      }}
                    >
                      {progress.percentage}% settled
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                <View
                  style={[
                    styles.progressBarTrack,
                    { backgroundColor: theme.colors.muted },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${progress.percentage}%`,
                        backgroundColor: progress.isFullySettled
                          ? "#22C55E"
                          : theme.colors.primary,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Modals */}
      <CreateSplitModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <SplitDetailModal
        visible={!!selectedSplit}
        split={selectedSplit}
        onClose={() => setSelectedSplit(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  heroSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  debtRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  debtItem: {
    flex: 1,
    gap: 4,
  },
  debtLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  debtDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 16,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  filterPillText: {
    fontSize: 12,
  },
  listContainer: {
    gap: 12,
  },
  splitCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  splitTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  categoryBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  settledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  settledBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  splitTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  splitMeta: {
    fontSize: 12,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
});
