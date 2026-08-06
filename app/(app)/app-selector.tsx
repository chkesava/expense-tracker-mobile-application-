import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Apple,
  ArrowRight,
  CheckCircle2,
  Clock,
  LayoutGrid,
  Wallet,
} from "lucide-react-native";

import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

import { useWorkspace } from "@/providers/WorkspaceProvider";

export default function AppSelectorScreen() {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { activeWorkspace, setActiveWorkspace } = useWorkspace();

  const handleSelectExpense = () => {
    Haptics.selectionAsync().catch(() => undefined);
    setActiveWorkspace("expense");
  };

  return (
    <PageShell contentContainerStyle={styles.container}>
      <PageHeader
        title="Choose Your Space"
        subtitle="Select workspace to launch"
        icon={<LayoutGrid size={22} color={theme.colors.primary} />}
      />

      <View style={styles.spacesGrid}>
        {/* Expense Tracker Space */}
        <Pressable
          onPress={handleSelectExpense}
          style={({ pressed }) => [
            styles.spaceCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.primary,
              borderWidth: 2,
              shadowColor: theme.colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.25 : 0.1,
              shadowRadius: 12,
              elevation: 4,
            },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary }]}>
              <Wallet size={24} color={theme.colors.primaryForeground} />
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isDark
                    ? "rgba(107, 99, 255, 0.2)"
                    : "rgba(79, 70, 255, 0.12)",
                },
              ]}
            >
              <CheckCircle2 size={12} color={theme.colors.primary} />
              <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                ACTIVE
              </Text>
            </View>
          </View>

          <Text
            style={[
              styles.spaceTitle,
              { color: theme.colors.foreground, fontSize: theme.typography.lg },
            ]}
          >
            Expense & Financial Vault
          </Text>

          <Text
            style={[
              styles.spaceDesc,
              { color: theme.colors.mutedForeground, fontSize: theme.typography.sm },
            ]}
          >
            Personal ledger, bank accounts, credit cards, split bills, subscriptions, and AI financial analytics.
          </Text>

          <View style={styles.cardFooter}>
            <Text style={[styles.launchText, { color: theme.colors.primary }]}>
              Open Workspace
            </Text>
            <ArrowRight size={16} color={theme.colors.primary} />
          </View>
        </Pressable>

        {/* Nutrition Space */}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            setActiveWorkspace("nutrition");
          }}
          style={({ pressed }) => [
            styles.spaceCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: activeWorkspace === "nutrition" ? theme.colors.primary : theme.colors.border,
              borderWidth: activeWorkspace === "nutrition" ? 2 : 1,
            },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: "rgba(34, 197, 94, 0.15)",
                },
              ]}
            >
              <Apple size={24} color="#22C55E" />
            </View>
            {activeWorkspace === "nutrition" && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: "rgba(34, 197, 94, 0.15)",
                  },
                ]}
              >
                <CheckCircle2 size={12} color="#22C55E" />
                <Text style={[styles.badgeText, { color: "#22C55E" }]}>
                  ACTIVE
                </Text>
              </View>
            )}
          </View>

          <Text
            style={[
              styles.spaceTitle,
              { color: theme.colors.foreground, fontSize: theme.typography.lg },
            ]}
          >
            Nutrition & Macro Tracker
          </Text>

          <Text
            style={[
              styles.spaceDesc,
              { color: theme.colors.mutedForeground, fontSize: theme.typography.sm },
            ]}
          >
            Calorie log, macronutrient tracking, meal plans, workout routines, and body weight trend graphs.
          </Text>

          <View style={styles.cardFooter}>
            <Text style={[styles.launchText, { color: theme.colors.primary }]}>
              Open Workspace
            </Text>
            <ArrowRight size={16} color={theme.colors.primary} />
          </View>
        </Pressable>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  spacesGrid: {
    gap: 16,
  },
  spaceCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  spaceTitle: {
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  spaceDesc: {
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  launchText: {
    fontWeight: "700",
    fontSize: 13,
  },
});
