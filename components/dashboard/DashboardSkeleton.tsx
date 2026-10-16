import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { Skeleton } from "@/components/common/Skeleton";
import { DASH_RADIUS, DASH_SPACE, useSurfaces } from "@/components/dashboard/primitives";
import { useTheme } from "@/theme/ThemeProvider";

export type DashboardSkeletonVariant =
  /** Net-worth hero: title, big figure, two split figures. */
  | "hero"
  /** Two summary cards side by side. */
  | "cards"
  /** A titled section with `rows` list rows. */
  | "section"
  /** A titled section with `rows` progress bars. */
  | "progress";

/**
 * SPENDLY-533 — loading placeholders shaped like the dashboard cards they
 * stand in for, so nothing jumps when real data arrives. Built on the shared
 * `Skeleton` pulse; the surfaces use the same radius and border as `Section`.
 */
export const DashboardSkeleton = memo(function DashboardSkeleton({
  variant,
  rows = 3,
}: {
  variant: DashboardSkeletonVariant;
  rows?: number;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const surface = [
    styles.surface,
    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
  ];

  if (variant === "cards") {
    return (
      <View style={styles.cardsRow} accessibilityLabel="Loading accounts">
        {[0, 1].map((key) => (
          <View key={key} style={[surface, styles.card]}>
            <Skeleton width={30} height={30} borderRadius={10} />
            <Skeleton width="60%" height={11} borderRadius={4} style={styles.mt10} />
            <Skeleton width="75%" height={18} borderRadius={5} style={styles.mt6} />
          </View>
        ))}
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <Skeleton width={32} height={32} borderRadius={10} />
      <View style={styles.headerText}>
        <Skeleton width="45%" height={14} borderRadius={4} />
        <Skeleton width="30%" height={10} borderRadius={3} />
      </View>
    </View>
  );

  if (variant === "hero") {
    return (
      <View style={surface} accessibilityLabel="Loading net worth">
        {header}
        <Skeleton width="62%" height={40} borderRadius={10} />
        <View style={[styles.split, { borderTopColor: surfaces.divider }]}>
          <View style={styles.splitCol}>
            <Skeleton width="50%" height={10} borderRadius={3} />
            <Skeleton width="70%" height={18} borderRadius={5} />
          </View>
          <View style={styles.splitCol}>
            <Skeleton width="50%" height={10} borderRadius={3} />
            <Skeleton width="70%" height={18} borderRadius={5} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={surface} accessibilityLabel="Loading">
      {header}
      <View style={styles.rows}>
        {Array.from({ length: rows }, (_, i) =>
          variant === "progress" ? (
            <View key={i} style={styles.progressRow}>
              <View style={styles.rowBetween}>
                <Skeleton width="40%" height={12} borderRadius={4} />
                <Skeleton width="22%" height={12} borderRadius={4} />
              </View>
              <Skeleton width="100%" height={6} borderRadius={3} />
            </View>
          ) : (
            <View key={i} style={styles.listRow}>
              <Skeleton width={36} height={36} borderRadius={18} />
              <View style={styles.listText}>
                <Skeleton width="55%" height={13} borderRadius={4} />
                <Skeleton width="35%" height={10} borderRadius={3} />
              </View>
              <Skeleton width={56} height={14} borderRadius={4} />
            </View>
          )
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  surface: {
    padding: DASH_SPACE.sectionPadding,
    borderRadius: DASH_RADIUS.section,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  cardsRow: {
    flexDirection: "row",
    gap: 10,
  },
  card: {
    flex: 1,
    borderRadius: DASH_RADIUS.tile + 2,
    padding: 14,
    gap: 0,
  },
  mt10: { marginTop: 10 },
  mt6: { marginTop: 6 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  split: {
    flexDirection: "row",
    gap: 28,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  splitCol: {
    flex: 1,
    gap: 8,
  },
  rows: {
    gap: 14,
  },
  progressRow: {
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  listText: {
    flex: 1,
    gap: 6,
  },
});
