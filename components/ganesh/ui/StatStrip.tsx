import { Children, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Responsive row of `StatTile`s. Compact is two-up, medium three-up, expanded
 * four-up. Each child is wrapped so `StatTile`'s `flex: 1` fills its cell
 * instead of stretching the whole strip.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { columns } = useBreakpoint();
  const items = Children.toArray(children);
  const basis = `${100 / columns - 1}%` as `${number}%`;

  return (
    <View style={[styles.row, { gap: theme.space.sm }]}>
      {items.map((child, index) => (
        <View key={index} style={[styles.cell, { flexBasis: basis }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  cell: {
    flexGrow: 1,
    minWidth: 140,
  },
});
