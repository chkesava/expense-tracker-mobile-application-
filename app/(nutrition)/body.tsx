import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Scale, Trash2 } from "lucide-react-native";

import { NutritionValue } from "@/components/nutrition/NutritionValue";
import { SimpleBarChart } from "@/components/nutrition/SimpleBarChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button, Card, Input } from "@/components/ui";
import { useNutritionProfile } from "@/hooks/useNutritionProfile";
import { useWeightHistory } from "@/hooks/useWeightHistory";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { parseLocalDate, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export default function BodyTrackingScreen() {
  const { theme } = useTheme();
  const { history, loading, addWeightRecord, deleteWeightRecord } = useWeightHistory();
  const { profile } = useNutritionProfile();
  const [weightInput, setWeightInput] = useState("");
  const [saving, setSaving] = useState(false);

  const chartData = useMemo(
    () =>
      [...history]
        .reverse()
        .slice(-7)
        .map((entry) => ({
          label: parseLocalDate(entry.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          value: entry.weightKg,
        })),
    [history]
  );

  const current = history[0]?.weightKg ?? profile?.weightKg ?? 0;

  const handleAdd = async () => {
    const weight = Number.parseFloat(weightInput);
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error("Enter a valid weight");
      return;
    }
    setSaving(true);
    try {
      await addWeightRecord(todayDateKey(), weight);
      setWeightInput("");
      toast.success("Weight recorded");
    } catch (error) {
      logError("nutrition.weight.add", error);
      toast.error("Could not save weight");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (date: string) => {
    Alert.alert("Delete this entry?", date, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteWeightRecord(date).catch((error) => {
            logError("nutrition.weight.delete", error);
            toast.error("Could not delete");
          });
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <PageShell hideHeaderOffset>
      <PageHeader
        title="Body"
        subtitle="Weight history from Firebase"
        icon={<Scale size={22} color={theme.colors.success} />}
      />

      <View style={styles.stack}>
        <Card
          title="Weight trend"
          subtitle={`Current ${current || "—"} kg · Target ${profile?.targetWeightKg || "—"} kg`}
        >
          {chartData.length > 0 ? (
            <SimpleBarChart
              data={chartData}
              maxValue={Math.max(
                profile?.targetWeightKg ?? 0,
                ...chartData.map((item) => item.value),
                1
              )}
              color="#8B5CF6"
            />
          ) : (
            <Text style={{ color: theme.colors.mutedForeground }}>
              No weigh-ins yet. Add today's weight to start the trend.
            </Text>
          )}
        </Card>

        <Card title="Log today's weight">
          <Input
            label="Weight (kg)"
            keyboardType="decimal-pad"
            value={weightInput}
            onChangeText={setWeightInput}
            placeholder="72.4"
          />
          <View style={{ marginTop: 12 }}>
            <Button onPress={() => void handleAdd()} loading={saving}>
              Save weight
            </Button>
          </View>
        </Card>

        <Card
          title="History"
          empty={history.length === 0}
          emptyTitle="No entries"
          emptyDescription="Saved weigh-ins from the web app show up here."
        >
          <View style={styles.list}>
            {history.map((entry) => (
              <View key={entry.id || entry.date} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                    {entry.date}
                  </Text>
                  <NutritionValue
                    value={entry.weightKg}
                    unit="kg"
                    digits={1}
                    style={{ color: theme.colors.mutedForeground }}
                  />
                </View>
                <Pressable
                  onPress={() => confirmDelete(entry.date)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${entry.date}`}
                  style={styles.iconHit}
                >
                  <Trash2 size={16} color={theme.colors.destructive} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: 12,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  flex: {
    flex: 1,
  },
  iconHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
