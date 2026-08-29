import { Children, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Side-by-side `Section`s from medium up; stacked on compact. Bottom nav stays
 * at every size — this is reflow, not a desktop sidebar.
 */
export function SectionPair({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { twoCol } = useBreakpoint();
  const items = Children.toArray(children);

  if (!twoCol || items.length < 2) {
    return <View style={{ gap: theme.space.lg }}>{items}</View>;
  }

  return (
    <View style={[styles.row, { gap: theme.space.lg }]}>
      {items.map((child, index) => (
        <View key={index} style={styles.col}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
});
