import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScanBarcode, Sparkles } from "lucide-react-native";

import { NutritionValue } from "@/components/nutrition/NutritionValue";
import { Card } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";
import type { Meal } from "@/shared/types/nutrition";

export function MealPlannerCard({
  meal,
  onOpen,
  onScan,
}: {
  meal: Meal;
  onOpen: () => void;
  onScan: () => void;
}) {
  const { theme } = useTheme();
  const foodCount = meal.foods?.length ?? 0;

  return (
    <Card
      title={meal.name}
      subtitle={foodCount > 0 ? `${foodCount} item${foodCount === 1 ? "" : "s"}` : "Nothing logged yet"}
      headerRight={
        <NutritionValue
          value={meal.totals?.calories ?? 0}
          unit="kcal"
          style={{
            color: theme.colors.mutedForeground,
            fontSize: 13,
            fontWeight: "700",
          }}
        />
      }
      onPress={onOpen}
    >
      {foodCount > 0 ? (
        <View style={styles.foods}>
          {meal.foods.slice(0, 3).map((food) => (
            <View key={food.id} style={styles.foodRow}>
              <View style={styles.foodCopy}>
                <Text
                  style={[styles.foodName, { color: theme.colors.foreground }]}
                  numberOfLines={1}
                >
                  {food.name}
                </Text>
                <Text
                  style={[styles.foodMeta, { color: theme.colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {food.quantity}
                </Text>
              </View>
              <NutritionValue
                value={food.nutrients.calories}
                unit="kcal"
                style={[styles.foodMeta, { color: theme.colors.mutedForeground }]}
              />
            </View>
          ))}
          {foodCount > 3 ? (
            <Text style={[styles.foodMeta, { color: theme.colors.mutedForeground }]}>
              +{foodCount - 3} more
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.colors.secondary },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Log food in ${meal.name}`}
        >
          <Sparkles size={16} color={theme.colors.secondaryForeground} />
          <Text
            style={[styles.actionText, { color: theme.colors.secondaryForeground }]}
          >
            AI log
          </Text>
        </Pressable>
        <Pressable
          onPress={onScan}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.colors.secondary },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Scan barcode for ${meal.name}`}
        >
          <ScanBarcode size={16} color={theme.colors.secondaryForeground} />
          <Text
            style={[styles.actionText, { color: theme.colors.secondaryForeground }]}
          >
            Scan
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  foods: {
    gap: 8,
    marginBottom: 12,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  foodCopy: {
    flex: 1,
    minWidth: 0,
  },
  foodName: {
    fontSize: 14,
    fontWeight: "600",
  },
  foodMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
