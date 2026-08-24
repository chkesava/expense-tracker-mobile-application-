import { Pressable, StyleSheet, Text, View } from "react-native";

import { MetaLabel, useSurfaces, GANESH_RADIUS } from "@/components/ganesh/ui";
import { Money } from "@/components/ganesh/ui/Money";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type MetricItem = {
  label: string;
  value: number | string;
  /** Extra line under the value — a count, a share, a hint. */
  meta?: string;
  onPress?: () => void;
};

/**
 * A compact metric grid built on the Expense Tracker's inset tile.
 *
 * Tiles are a *supporting* surface: no border, low-contrast fill, so a screen
 * full of them can never read as a wall of cards. Keep to four or fewer per
 * section — long lists of numbers belong in a `Section` of `DataRow`s.
 */
export function MetricGrid({
  items,
  columns = 2,
}: {
  items: MetricItem[];
  columns?: 2 | 3;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const basis: `${number}%` = columns === 3 ? "30%" : "45%";

  return (
    <View style={styles.grid}>
      {items.map((item) => {
        const body = (
          <>
            <MetaLabel numberOfLines={2}>{item.label}</MetaLabel>
            {typeof item.value === "number" ? (
              <Money value={item.value} size="primary" numberOfLines={1} adjustsFontSizeToFit />
            ) : (
              <Text
                numberOfLines={1}
                style={[
                  styles.textValue,
                  { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                {item.value}
              </Text>
            )}
            {item.meta ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.meta,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                {item.meta}
              </Text>
            ) : null}
          </>
        );

        const tileStyle = [
          styles.tile,
          { backgroundColor: surfaces.tile, minWidth: basis },
        ];

        if (!item.onPress) {
          return (
            <View key={item.label} style={tileStyle}>
              {body}
            </View>
          );
        }

        return (
          <Pressable
            key={item.label}
            onPress={() => {
              void haptic.selection();
              item.onPress?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}, ${item.value}`}
            android_ripple={{
              color: surfaces.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
              borderless: false,
            }}
            style={({ pressed }) => [tileStyle, pressed && { opacity: 0.85 }]}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 12,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    gap: 3,
    overflow: "hidden",
  },
  textValue: {
    fontSize: 17,
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
});
