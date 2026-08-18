import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ScanBarcode, Trash2 } from "lucide-react-native";

import { NutritionValue } from "@/components/nutrition/NutritionValue";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { NutritionAiConsentDialog } from "@/components/privacy/NutritionAiConsentDialog";
import { Button, Card, Input } from "@/components/ui";
import { useDailyLog } from "@/hooks/useDailyLog";
import { useDpdpConsent } from "@/hooks/useDpdpConsent";
import { subscribeNutritionScan } from "@/lib/nutritionScanBridge";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { analyzeNutrition, type AnalyzedFood } from "@/services/nutritionAiService";
import { useTheme } from "@/theme/ThemeProvider";

export default function NutritionMealScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { dateStr, mealId } = useLocalSearchParams<{
    dateStr?: string;
    mealId?: string;
  }>();
  const { meals, loading, saveFoodsToMeal, removeFoodFromMeal } = useDailyLog(
    dateStr || ""
  );
  const [inputText, setInputText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedFoods, setParsedFoods] = useState<AnalyzedFood[]>([]);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const { purposes, setPurposes, saving: consentSaving } = useDpdpConsent();

  const meal = meals.find((item) => item.id === mealId);

  useEffect(() => {
    return subscribeNutritionScan((food) => {
      setParsedFoods((prev) => [...prev, food]);
      toast.success(`Found: ${food.name}`);
    });
  }, []);

  const runAnalyze = async () => {
    if (!inputText.trim()) return;
    setAnalyzing(true);
    try {
      const foods = await analyzeNutrition(inputText.trim(), {
        nutritionAiConsent: true,
      });
      setParsedFoods(foods);
      setInputText("");
    } catch (error) {
      logError("nutrition.meal.analyze", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to analyze food"
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    if (!purposes.nutritionAi) {
      setAiConsentOpen(true);
      return;
    }
    await runAnalyze();
  };

  const handleSave = async () => {
    if (!mealId || parsedFoods.length === 0) return;
    setSaving(true);
    try {
      await saveFoodsToMeal(mealId, parsedFoods);
      setParsedFoods([]);
      toast.success("Added to your log");
    } catch (error) {
      logError("nutrition.meal.save", error);
      toast.error("Could not save foods");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!dateStr || !mealId || !meal) {
    return (
      <PageShell hideHeaderOffset>
        <PageHeader title="Meal" subtitle="Not found" />
        <Button variant="ghost" onPress={() => router.back()}>
          Go back
        </Button>
      </PageShell>
    );
  }

  return (
    <PageShell hideHeaderOffset>
      <PageHeader
        title={meal.name}
        subtitle="Describe food or scan a barcode"
        icon={
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          >
            <ArrowLeft size={20} color={theme.colors.foreground} />
          </Pressable>
        }
      />

      <Card>
        <Input
          label="What did you eat?"
          placeholder="2 scrambled eggs, toast, black coffee"
          value={inputText}
          onChangeText={setInputText}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <View style={styles.actions}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(nutrition)/scanner",
                params: { dateStr, mealId },
              } as never)
            }
            style={({ pressed }) => [
              styles.scanBtn,
              { backgroundColor: theme.colors.secondary },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Scan barcode"
          >
            <ScanBarcode size={16} color={theme.colors.secondaryForeground} />
            <Text style={{ color: theme.colors.secondaryForeground, fontWeight: "700" }}>
              Scan
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Button
              onPress={() => void handleAnalyze()}
              loading={analyzing}
              disabled={!inputText.trim()}
            >
              Parse with AI
            </Button>
          </View>
        </View>
      </Card>

      {parsedFoods.length > 0 ? (
        <Card
          title="Review"
          subtitle="Confirm before saving to Firebase"
          headerRight={
            <Pressable onPress={() => setParsedFoods([])} accessibilityLabel="Clear review">
              <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
                Clear
              </Text>
            </Pressable>
          }
        >
          <View style={styles.list}>
            {parsedFoods.map((food, index) => (
              <View key={`${food.name}-${index}`} style={styles.foodRow}>
                <View style={styles.flex}>
                  <Text style={[styles.foodName, { color: theme.colors.foreground }]}>
                    {food.name}
                  </Text>
                  <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                    {food.quantity} · {Math.round(food.nutrients.calories)} kcal · P
                    {Math.round(food.nutrients.protein)} C{Math.round(food.nutrients.carbs)} F
                    {Math.round(food.nutrients.fat)}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    setParsedFoods((prev) => prev.filter((_, i) => i !== index))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${food.name}`}
                  style={styles.iconHit}
                >
                  <Trash2 size={16} color={theme.colors.destructive} />
                </Pressable>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <Button onPress={() => void handleSave()} loading={saving}>
              Save to {meal.name}
            </Button>
          </View>
        </Card>
      ) : null}

      <Card
        title="Logged"
        empty={meal.foods.length === 0}
        emptyTitle="Nothing logged yet"
        emptyDescription="Use AI or scan a barcode to add food."
      >
        <View style={styles.list}>
          {meal.foods.map((food) => (
            <View key={food.id} style={styles.foodRow}>
              <View style={styles.flex}>
                <Text style={[styles.foodName, { color: theme.colors.foreground }]}>
                  {food.name}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                  {food.quantity}
                </Text>
              </View>
              <NutritionValue
                value={food.nutrients.calories}
                unit="kcal"
                style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}
              />
              <Pressable
                onPress={() => {
                  void removeFoodFromMeal(meal.id, food.id).catch(() =>
                    toast.error("Could not remove food")
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${food.name}`}
                style={styles.iconHit}
              >
                <Trash2 size={16} color={theme.colors.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      </Card>
      <NutritionAiConsentDialog
        isOpen={aiConsentOpen}
        onClose={() => setAiConsentOpen(false)}
        confirming={consentSaving || analyzing}
        onConfirm={() => {
          void (async () => {
            await setPurposes({ nutritionAi: true });
            setAiConsentOpen(false);
            await runAnalyze();
          })();
        }}
      />
    </PageShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    alignItems: "center",
  },
  scanBtn: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  list: {
    gap: 10,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  foodName: {
    fontWeight: "700",
    fontSize: 14,
  },
  iconHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
