import React from "react";
import { StyleSheet, View } from "react-native";
import { Skeleton } from "@/components/common/Skeleton";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * Material 3 Dashboard Shimmer Skeleton
 * 
 * Accurately mimics the Dashboard layout to prevent any layout shifting or white flashes:
 * - Overview Hero Card (Net balance, Income, Expenses)
 * - Action Chips row
 * - Recent Activity list items
 */
export function DashboardSkeleton() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View style={styles.container}>
      {/* Hero Overview Card Skeleton */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {/* Header: Subtitle & Month pill */}
        <View style={styles.rowBetween}>
          <Skeleton width={120} height={14} borderRadius={4} />
          <Skeleton width={80} height={28} borderRadius={14} />
        </View>

        {/* Hero Amount */}
        <View style={{ gap: 8, marginVertical: 8 }}>
          <Skeleton width="60%" height={36} borderRadius={8} />
          <Skeleton width="40%" height={14} borderRadius={4} />
        </View>

        {/* Tonal Stats Grid (Income & Expense) */}
        <View style={styles.tonalGrid}>
          <View
            style={[
              styles.tonalCard,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Skeleton width={60} height={12} borderRadius={4} />
            <Skeleton width="75%" height={20} borderRadius={6} />
          </View>

          <View
            style={[
              styles.tonalCard,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Skeleton width={60} height={12} borderRadius={4} />
            <Skeleton width="75%" height={20} borderRadius={6} />
          </View>
        </View>
      </View>

      {/* Action Chips Row Skeleton */}
      <View style={styles.chipsRow}>
        <Skeleton width={96} height={36} borderRadius={18} />
        <Skeleton width={96} height={36} borderRadius={18} />
        <Skeleton width={96} height={36} borderRadius={18} />
        <Skeleton width={96} height={36} borderRadius={18} />
      </View>

      {/* Recent Activity Card Skeleton */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Skeleton width={140} height={18} borderRadius={6} />
          <Skeleton width={60} height={14} borderRadius={4} />
        </View>

        {/* Transaction Rows */}
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.txRow}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="50%" height={14} borderRadius={4} />
              <Skeleton width="30%" height={10} borderRadius={3} />
            </View>
            <Skeleton width={64} height={16} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    width: "100%",
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tonalGrid: {
    flexDirection: "row",
    gap: 12,
  },
  tonalCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
});
