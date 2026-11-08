import { Children, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * SPENDLY-718 — the desktop dashboard composition (web, ≥ 1280px), slots only.
 *
 *   overview   net worth | totals + quick actions   (NetWorthWidget "desktop")
 *   notices    duress / announcement / welcome / setup, when present
 *   analytics  Spending Overview | Income vs Expenses
 *   lower      Upcoming | Recent Transactions | Budget
 *   more       every other card, in the existing ResponsiveGrid
 *
 * It owns no data and no hooks: the screen renders each widget (the same
 * instances and handlers as the phone layout) and this only places them.
 * Rows stretch their cells to one height; a missing slot (a card the user
 * turned off) is dropped and the rest of its row re-flexes.
 */
export function DesktopDashboardLayout({
  gap,
  overview,
  notices,
  analytics,
  analyticsWeights,
  lower,
  more,
}: {
  gap: number;
  overview: ReactNode;
  notices?: ReactNode;
  analytics: ReactNode[];
  /** Flex weight per analytics cell (`desktopAnalyticsSplit`); equal when omitted. */
  analyticsWeights?: readonly number[];
  lower: ReactNode[];
  more?: ReactNode;
}) {
  return (
    <View style={{ gap }} testID="dash-desktop">
      {overview}
      {notices}
      <DesktopRow gap={gap} weights={analyticsWeights} testID="dash-row-analytics">
        {analytics}
      </DesktopRow>
      <DesktopRow gap={gap} testID="dash-row-lower">
        {lower}
      </DesktopRow>
      {more}
    </View>
  );
}

/**
 * Cells that stretch to the tallest; empty slots are skipped. Weights apply
 * only when every slot is present, so a lone card takes the full row.
 */
function DesktopRow({
  gap,
  weights,
  children,
  testID,
}: {
  gap: number;
  weights?: readonly number[];
  children: ReactNode[];
  testID: string;
}) {
  const cells = Children.toArray(children).filter(Boolean);
  if (cells.length === 0) return null;
  const weighted = weights && weights.length === children.length && cells.length === children.length;
  return (
    <View style={[styles.row, { gap }]} testID={testID}>
      {cells.map((cell, index) => (
        <View
          key={isValidElement(cell) && cell.key != null ? cell.key : index}
          style={[styles.cell, weighted && { flex: weights?.[index] ?? 1 }]}
        >
          {cell}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});
