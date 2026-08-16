import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Flame, Plus, X } from "lucide-react-native";

import { Card, Input, Button } from "@/components/ui";
import { NutritionValue } from "@/components/nutrition/NutritionValue";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";

export function WorkoutCard({
  durationMinutes,
  caloriesBurned,
  onSave,
}: {
  durationMinutes: number;
  caloriesBurned: number;
  onSave: (durationMinutes: number, caloriesBurned: number) => Promise<void> | void;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState("");
  const [cals, setCals] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const duration = Number.parseInt(mins, 10);
    const calories = Number.parseInt(cals, 10);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(calories) || calories <= 0) {
      toast.error("Enter valid minutes and calories");
      return;
    }
    setSaving(true);
    try {
      await onSave(duration, calories);
      setMins("");
      setCals("");
      setOpen(false);
      toast.success("Workout logged");
    } catch {
      toast.error("Could not save workout");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Activity"
      subtitle={`${durationMinutes} min · ${caloriesBurned} kcal`}
      icon={
        <View style={[styles.iconWrap, { backgroundColor: "rgba(249, 115, 22, 0.16)" }]}>
          <Flame size={20} color="#F97316" />
        </View>
      }
      headerRight={
        <Pressable
          onPress={() => setOpen((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={open ? "Cancel workout" : "Log workout"}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: "rgba(249, 115, 22, 0.12)" },
            pressed && { opacity: 0.8 },
          ]}
        >
          {open ? <X size={18} color="#F97316" /> : <Plus size={18} color="#F97316" />}
        </Pressable>
      }
    >
      <View style={styles.stats}>
        <NutritionValue
          value={durationMinutes}
          unit="min"
          style={[styles.stat, { color: theme.colors.foreground }]}
        />
        <NutritionValue
          value={caloriesBurned}
          unit="kcal"
          style={[styles.stat, { color: theme.colors.foreground }]}
        />
      </View>
      {open ? (
        <View style={styles.form}>
          <Input
            label="Minutes"
            keyboardType="numeric"
            value={mins}
            onChangeText={setMins}
            placeholder="45"
          />
          <Input
            label="Calories burned"
            keyboardType="numeric"
            value={cals}
            onChangeText={setCals}
            placeholder="320"
          />
          <Button onPress={() => void handleSave()} loading={saving}>
            Log workout
          </Button>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  stats: {
    flexDirection: "row",
    gap: 16,
  },
  stat: {
    fontSize: 16,
    fontWeight: "800",
  },
  form: {
    marginTop: 12,
    gap: 10,
  },
});
