import { Children, isValidElement, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export interface DesktopDashboardRow {
  cells: ReactNode[];
  /** Flex weight per cell; equal when omitted. */
  weights?: readonly number[];
  /**
   * `stretch` (default): every cell takes the row's tallest height — right
   * for same-density cards (e.g. three comparable analytics cards). `start`
   * keeps each cell its own content height — for a row mixing a short card
   * (SPENDLY dashboard redesign fix: Cash Flow's five lines) with a much
   * taller one (a transaction list, a calendar grid), `stretch` left the
   * short card mostly empty instead of sized to what it actually holds.
   */
  align?: "stretch" | "start";
}

/**
 * SPENDLY-718 (SPENDLY dashboard redesign) — the desktop dashboard
 * composition (web, ≥ 1280px), slots only.
 *
 *   overview   net worth | KPI grid                 (NetWorthWidget "desktop")
 *   notices    duress / announcement / welcome / setup, when present
 *   rows       every fixed row below it, in order, matching the design
 *              reference's row-by-row composition
 *   more       every other (user-toggleable) card, in the existing ResponsiveGrid
 *
 * It owns no data and no hooks: the screen renders each widget (the same
 * instances and handlers as the phone layout) and this only places them.
 * Rows stretch their cells to one height; a missing cell (a card the user
 * turned off) is dropped and the rest of its row re-flexes.
 */
export function DesktopDashboardLayout({
  gap,
  overview,
  notices,
  rows,
  more,
}: {
  gap: number;
  overview: ReactNode;
  notices?: ReactNode;
  rows: DesktopDashboardRow[];
  more?: ReactNode;
}) {
  return (
    <View style={{ gap }} testID="dash-desktop">
      {overview}
      {notices}
      {rows.map((row, index) => (
        <DesktopRow key={index} gap={gap} weights={row.weights} align={row.align} testID={`dash-row-${index}`}>
          {row.cells}
        </DesktopRow>
      ))}
      {more}
    </View>
  );
}

/**
 * Cells that stretch to the tallest; empty slots are skipped. Weights apply
 * only when every slot is present, so a lone card takes the full row.
 *
 * Unweighted rows (the common case) wrap: each cell wants at least
 * `MIN_CELL_WIDTH`, so a row of 3–4 cards reflows to 2-up, then 1-up, as the
 * viewport narrows, rather than being flex-squeezed down to an unreadable
 * sliver (SPENDLY dashboard redesign — the fixed `flex: 1` + `minWidth: 0`
 * this replaced let 3-up rows overflow their own cards below ~1600px).
 */
function DesktopRow({
  gap,
  weights,
  align = "stretch",
  children,
  testID,
}: {
  gap: number;
  weights?: readonly number[];
  align?: "stretch" | "start";
  children: ReactNode[];
  testID: string;
}) {
  const cells = Children.toArray(children).filter(Boolean);
  if (cells.length === 0) return null;
  const weighted = weights && weights.length === children.length && cells.length === children.length;
  return (
    <View
      style={[styles.row, { gap, alignItems: align === "start" ? "flex-start" : "stretch" }, weighted && styles.rowNoWrap]}
      testID={testID}
    >
      {cells.map((cell, index) => (
        <View
          key={isValidElement(cell) && cell.key != null ? cell.key : index}
          style={[weighted ? styles.weightedCell : styles.cell, weighted && { flex: weights?.[index] ?? 1 }]}
        >
          {cell}
        </View>
      ))}
    </View>
  );
}

/** A card never shrinks narrower than this before its row wraps to the next line. */
const MIN_CELL_WIDTH = 300;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  rowNoWrap: {
    flexWrap: "nowrap",
  },
  cell: {
    flexGrow: 1,
    flexBasis: MIN_CELL_WIDTH,
    minWidth: MIN_CELL_WIDTH,
  },
  weightedCell: {
    minWidth: 0,
  },
});
