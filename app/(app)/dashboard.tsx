import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CreditCard,
  Flame,
  Home as HomeIcon,
  PieChart,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Split,
  Target,
  Wallet,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/providers/AuthProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { currentMonthKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function DashboardScreen() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { isDuress } = useAuth();
  const { settings: system } = useSystemSettings();
  const { settings } = useSettings();
  const { globalMonth, setIsAddExpenseOpen, setIsMonthDrawerOpen } = useModals();

  const [refreshing, setRefreshing] = useState(false);

  const activeMonth = globalMonth || currentMonthKey(settings.timezone);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 600);
  };

  return (
    <PageShell
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.container}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Financial Overview"
        icon={<HomeIcon size={22} color={theme.colors.primary} />}
      />

      {/* Duress Session Warning */}
      {isDuress ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(245, 158, 11, 0.1)",
              borderColor: theme.colors.warning,
            },
          ]}
        >
          <ShieldAlert size={18} color={theme.colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: theme.colors.warning }]}>
              Duress Mode Active
            </Text>
            <Text style={[styles.alertText, { color: theme.colors.mutedForeground }]}>
              Running isolated decoy session. Real ledger data is not loaded.
            </Text>
          </View>
        </View>
      ) : null}

      {/* System Announcement Banner */}
      {system.announcementBanner ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.15)"
                : "rgba(79, 70, 255, 0.08)",
              borderColor: theme.colors.primary,
            },
          ]}
        >
          <Sparkles size={18} color={theme.colors.primary} />
          <Text style={[styles.alertText, { color: theme.colors.foreground, flex: 1 }]}>
            {system.announcementBanner}
          </Text>
        </View>
      ) : null}

      {/* Main Balance & Overview Bento Card */}
      <View
        style={[
          styles.overviewCard,
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
        <View style={styles.overviewHeader}>
          <Text style={[styles.overviewSubtitle, { color: theme.colors.mutedForeground }]}>
            TOTAL BALANCE
          </Text>
          <Pressable
            onPress={() => setIsMonthDrawerOpen(true)}
            style={({ pressed }) => [
              styles.monthBadge,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
                borderColor: theme.colors.border,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.monthBadgeText, { color: theme.colors.primary }]}>
              {activeMonth}
            </Text>
          </Pressable>
        </View>

        <View style={styles.amountRow}>
          <Amount
            value={0}
            currency={system.defaultCurrency}
            ghostable
            style={{ fontSize: theme.typography.xxl, fontWeight: "900" }}
          />
        </View>

        {/* In / Out Stats */}
        <View
          style={[
            styles.statsRow,
            {
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.statBox}>
            <View style={styles.statLabelRow}>
              <ArrowDownLeft size={14} color={theme.colors.success} />
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                Income
              </Text>
            </View>
            <Amount
              value={0}
              currency={system.defaultCurrency}
              ghostable
              style={{ color: theme.colors.success, fontSize: theme.typography.md, fontWeight: "700" }}
            />
          </View>

          <View
            style={[
              styles.statDivider,
              { backgroundColor: theme.colors.border },
            ]}
          />

          <View style={styles.statBox}>
            <View style={styles.statLabelRow}>
              <ArrowUpRight size={14} color={theme.colors.destructive} />
              <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                Spent
              </Text>
            </View>
            <Amount
              value={0}
              currency={system.defaultCurrency}
              ghostable
              style={{ color: theme.colors.foreground, fontSize: theme.typography.md, fontWeight: "700" }}
            />
          </View>
        </View>
      </View>

      {/* Quick Action Buttons */}
      <View style={styles.quickActionsGrid}>
        <Pressable
          onPress={() => setIsAddExpenseOpen(true)}
          style={({ pressed }) => [
            styles.quickActionButton,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.12)"
                : "rgba(79, 70, 255, 0.08)",
              borderColor: isDark ? "rgba(107, 99, 255, 0.3)" : "rgba(79, 70, 255, 0.2)",
            },
            pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: theme.colors.primary }]}>
            <Plus size={18} color={theme.colors.primaryForeground} strokeWidth={2.5} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
            Add Expense
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/ledger");
          }}
          style={({ pressed }) => [
            styles.quickActionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
          <View
            style={[
              styles.actionIconWrap,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <Wallet size={18} color={theme.colors.foreground} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
            Ledger
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/insights");
          }}
          style={({ pressed }) => [
            styles.quickActionButton,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
            pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
          <View
            style={[
              styles.actionIconWrap,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <BarChart3 size={18} color={theme.colors.foreground} />
          </View>
          <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
            Insights
          </Text>
        </Pressable>
      </View>

      {/* Widgets & Placeholders Grid */}
      <View style={styles.widgetsGrid}>
        {/* Monthly Budget Card */}
        {settings.monthlyBudget > 0 ? (
          <Card
            title="Monthly Budget"
            subtitle={`Target: ${system.defaultCurrency}${settings.monthlyBudget.toLocaleString()}`}
          >
            <View style={styles.budgetProgressContainer}>
              <View
                style={[
                  styles.progressBarBg,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: "15%",
                      backgroundColor: theme.colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.budgetText, { color: theme.colors.mutedForeground }]}>
                Realtime calculations connect in Phase 6.
              </Text>
            </View>
          </Card>
        ) : null}

        {/* Recent Transactions Placeholder */}
        <Card
          title="Recent Transactions"
          subtitle="Latest ledger activity"
        >
          <View style={styles.emptyCardContent}>
            <PieChart size={32} color={theme.colors.mutedForeground} />
            <Text style={[styles.emptyCardText, { color: theme.colors.mutedForeground }]}>
              Realtime Firestore ledger listeners arrive in Phase 6.
            </Text>
          </View>
        </Card>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  alertTitle: {
    fontWeight: "800",
    fontSize: 13,
  },
  alertText: {
    fontSize: 12,
    lineHeight: 16,
  },
  overviewCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overviewSubtitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  monthBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  monthBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  amountRow: {
    paddingVertical: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 4,
  },
  statBox: {
    flex: 1,
    gap: 4,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 12,
  },
  quickActionsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  quickActionButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  widgetsGrid: {
    gap: 14,
  },
  budgetProgressContainer: {
    gap: 8,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  budgetText: {
    fontSize: 12,
  },
  emptyCardContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 10,
  },
  emptyCardText: {
    fontSize: 13,
    textAlign: "center",
  },
});
