import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import type { TimelineRow } from "@/shared/utils/runwayView";
import { withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Month-by-month runway timeline (SPENDLY-210). Plain views, no chart
 * library, so it stays cheap to render on Android. Actual and projected
 * months differ by a text tag and a solid vs outlined bar — never by colour
 * alone — and months below the reserve carry an icon and the words.
 */
export const RunwayTimeline = memo(function RunwayTimeline({ rows, format }: { rows: TimelineRow[]; format: (n: number) => string }) {
  const { theme } = useTheme();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const muted = { ...text, color: theme.colors.mutedForeground };

  return (
    <View style={{ gap: theme.space.xs }}>
      {rows.map((r, i) => {
        const projected = r.kind === "projected";
        const firstProjected = projected && rows[i - 1]?.kind !== "projected";
        const barColor = r.net >= 0 ? theme.colors.primary : theme.colors.destructive;
        return (
          <View key={r.key}>
            {firstProjected ? (
              <Text style={[muted, { marginTop: theme.space.sm, fontFamily: theme.fontFamily.semibold }]} accessibilityRole="header">
                Projected from today
              </Text>
            ) : null}
            <View style={[styles.row, { gap: theme.space.sm, minHeight: 44 }]} accessible accessibilityLabel={r.accessibilityLabel}>
              <View style={{ width: 64 }}>
                <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{r.label}</Text>
                <Text style={muted}>{projected ? "Projected" : "Actual"}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View
                  style={{
                    height: 10,
                    width: `${Math.max(2, (Math.abs(r.net) / max) * 100)}%`,
                    borderRadius: 5,
                    borderWidth: projected ? 1.5 : 0,
                    borderStyle: projected ? "dashed" : "solid",
                    borderColor: barColor,
                    backgroundColor: projected ? withAlpha(barColor, 0.15) : barColor,
                  }}
                />
                <Text style={muted} numberOfLines={1}>
                  {r.net >= 0 ? "Surplus" : "Deficit"} {format(Math.abs(r.net))}
                  {r.closing !== null ? ` · ends at ${format(r.closing)}` : ""}
                </Text>
              </View>
              {r.belowFloor ? (
                <View style={[styles.row, { gap: 4 }]}>
                  <AlertTriangle size={14} color={theme.colors.destructive} />
                  <Text style={[text, { color: theme.colors.destructive }]}>Below reserve</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
