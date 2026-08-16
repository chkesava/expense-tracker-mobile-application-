import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export function SimpleBarChart({
  data,
  maxValue,
  color,
}: {
  data: Array<{ label: string; value: number }>;
  maxValue: number;
  color: string;
}) {
  const { theme } = useTheme();
  const ceiling = Math.max(maxValue, 1);

  return (
    <View style={styles.row}>
      {data.map((item) => {
        const heightPct = Math.max(4, Math.min(100, (item.value / ceiling) * 100));
        return (
          <View key={item.label} style={styles.col}>
            <Text style={[styles.value, { color: theme.colors.mutedForeground }]}>
              {Math.round(item.value)}
            </Text>
            <View style={[styles.track, { backgroundColor: theme.colors.muted }]}>
              <View
                style={[
                  styles.fill,
                  { height: `${heightPct}%`, backgroundColor: color },
                ]}
              />
            </View>
            <Text
              style={[styles.label, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 168,
    gap: 8,
  },
  col: {
    flex: 1,
    alignItems: "center",
    height: "100%",
    gap: 6,
  },
  track: {
    flex: 1,
    width: "100%",
    borderRadius: 10,
    borderCurve: "continuous",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  fill: {
    width: "100%",
    borderRadius: 10,
    borderCurve: "continuous",
  },
  value: {
    fontSize: 10,
    fontWeight: "700",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
});
