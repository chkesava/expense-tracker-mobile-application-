import { Pressable, StyleSheet, Text, View } from "react-native";
import { Droplet } from "lucide-react-native";

import { Card } from "@/components/ui";
import { NutritionValue } from "@/components/nutrition/NutritionValue";
import { useTheme } from "@/theme/ThemeProvider";

export function WaterCard({
  currentMl,
  targetMl,
  onAdd,
}: {
  currentMl: number;
  targetMl: number;
  onAdd: (amountMl: number) => void;
}) {
  const { theme } = useTheme();
  const progress = targetMl > 0 ? Math.min(currentMl / targetMl, 1) : 0;

  return (
    <Card title="Water" subtitle="Daily hydration">
      <View style={styles.row}>
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: "rgba(59, 130, 246, 0.14)" },
          ]}
        >
          <Droplet size={22} color="#3B82F6" />
        </View>
        <View style={styles.copy}>
          <View style={styles.valueRow}>
            <NutritionValue
              value={currentMl}
              style={[styles.value, { color: theme.colors.foreground }]}
            />
            <Text style={[styles.unit, { color: theme.colors.mutedForeground }]}>
              / {targetMl} ml
            </Text>
          </View>
          <View
            style={[
              styles.track,
              { backgroundColor: theme.colors.muted },
            ]}
          >
            <View
              style={[
                styles.fill,
                { width: `${progress * 100}%`, backgroundColor: "#3B82F6" },
              ]}
            />
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => onAdd(250)}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: "rgba(59, 130, 246, 0.12)" },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add 250 milliliters"
        >
          <Text style={[styles.addText, { color: "#2563EB" }]}>+ 250 ml</Text>
        </Pressable>
        <Pressable
          onPress={() => onAdd(500)}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: "rgba(59, 130, 246, 0.12)" },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add 500 milliliters"
        >
          <Text style={[styles.addText, { color: "#2563EB" }]}>+ 500 ml</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: 8,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
  },
  unit: {
    fontSize: 13,
    fontWeight: "600",
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  addBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  addText: {
    fontWeight: "700",
    fontSize: 13,
  },
});
