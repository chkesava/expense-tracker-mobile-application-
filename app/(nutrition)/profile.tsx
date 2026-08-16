import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeftRight, LogOut, User } from "lucide-react-native";

import { ChipSelect } from "@/components/nutrition/ChipSelect";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button, Card, Input } from "@/components/ui";
import { useNutritionProfile } from "@/hooks/useNutritionProfile";
import { calculateNutritionGoals } from "@/shared/utils/nutritionGoals";
import { haptic } from "@/lib/haptics";
import { logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import type {
  ActivityLevel,
  GoalType,
  NutritionProfile,
} from "@/shared/types/nutrition";
import { useTheme } from "@/theme/ThemeProvider";

const GOALS: Array<{ label: string; value: GoalType }> = [
  { label: "Fat loss", value: "fat_loss" },
  { label: "Muscle gain", value: "muscle_gain" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Lean bulk", value: "lean_bulk" },
];

const ACTIVITY: Array<{ label: string; value: ActivityLevel }> = [
  { label: "Sedentary", value: "sedentary" },
  { label: "Light", value: "light" },
  { label: "Moderate", value: "moderate" },
  { label: "Active", value: "active" },
  { label: "Very active", value: "very_active" },
];

const GENDERS: Array<{ label: string; value: NutritionProfile["gender"] }> = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
];

const DEFAULT_FORM: NutritionProfile = {
  age: 30,
  gender: "male",
  heightCm: 175,
  weightKg: 70,
  targetWeightKg: 65,
  goal: "fat_loss",
  activityLevel: "moderate",
  dietPreference: "anything",
  allergies: [],
};

export default function NutritionProfileScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { settings, setGhostMode } = useSettings();
  const { setActiveWorkspace } = useWorkspace();
  const { profile, loading, updateProfileAndGoals } = useNutritionProfile();
  const [form, setForm] = useState<NutritionProfile>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const preview = calculateNutritionGoals(form);
  const patch = <K extends keyof NutritionProfile>(key: K, value: NutritionProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.age || !form.heightCm || !form.weightKg || !form.targetWeightKg) {
      toast.error("Fill age, height, weight, and target weight");
      return;
    }
    setSaving(true);
    try {
      await updateProfileAndGoals(form);
      toast.success("Profile saved");
      void haptic.save();
      if (!profile) router.replace("/(nutrition)" as never);
    } catch (error) {
      logError("nutrition.profile.save", error);
      toast.error("Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell hideHeaderOffset>
      <PageHeader
        title="Profile"
        subtitle="Synced with your web account"
        icon={<User size={22} color={theme.colors.success} />}
      />

      <View style={styles.stack}>
        <Card title="Basic info">
          <View style={styles.row}>
            <Input
              label="Age"
              keyboardType="numeric"
              value={String(form.age || "")}
              onChangeText={(text) => patch("age", Number.parseInt(text, 10) || 0)}
              containerStyle={styles.flex}
            />
          </View>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Gender
          </Text>
          <ChipSelect options={GENDERS} value={form.gender} onChange={(v) => patch("gender", v)} />
          <View style={styles.row}>
            <Input
              label="Height (cm)"
              keyboardType="numeric"
              value={String(form.heightCm || "")}
              onChangeText={(text) => patch("heightCm", Number.parseInt(text, 10) || 0)}
              containerStyle={styles.flex}
            />
            <Input
              label="Weight (kg)"
              keyboardType="decimal-pad"
              value={String(form.weightKg || "")}
              onChangeText={(text) => patch("weightKg", Number.parseFloat(text) || 0)}
              containerStyle={styles.flex}
            />
          </View>
        </Card>

        <Card title="Goals & activity">
          <Input
            label="Target weight (kg)"
            keyboardType="decimal-pad"
            value={String(form.targetWeightKg || "")}
            onChangeText={(text) =>
              patch("targetWeightKg", Number.parseFloat(text) || 0)
            }
          />
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Primary goal
          </Text>
          <ChipSelect options={GOALS} value={form.goal} onChange={(v) => patch("goal", v)} />
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
            Activity level
          </Text>
          <ChipSelect
            options={ACTIVITY}
            value={form.activityLevel}
            onChange={(v) => patch("activityLevel", v)}
          />
        </Card>

        <Card title="Calculated daily targets">
          <View style={styles.goalsGrid}>
            <GoalStat label="Calories" value={`${preview.targetCalories}`} color={theme.colors.success} />
            <GoalStat label="Protein" value={`${preview.proteinGrams}g`} color="#3B82F6" />
            <GoalStat label="Carbs" value={`${preview.carbsGrams}g`} color="#F59E0B" />
            <GoalStat label="Fat" value={`${preview.fatGrams}g`} color="#EF4444" />
          </View>
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 8 }}>
            Maintenance {preview.maintenanceCalories} kcal · Water {preview.waterMl} ml
          </Text>
          <View style={{ marginTop: 12 }}>
            <Button onPress={() => void handleSave()} loading={saving || loading}>
              Save profile
            </Button>
          </View>
        </Card>

        <Card title="App settings" subtitle="Same account settings as the expense app">
          <View style={styles.settingRow}>
            <View style={styles.flex}>
              <Text style={[styles.settingTitle, { color: theme.colors.foreground }]}>
                Ghost mode
              </Text>
              <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                Hide amounts across the app
              </Text>
            </View>
            <Switch
              value={settings.ghostMode}
              onValueChange={(value) => {
                void haptic.selection();
                setGhostMode(value);
              }}
            />
          </View>
          <Text
            style={{ color: theme.colors.mutedForeground, fontSize: 12, marginBottom: 8 }}
            numberOfLines={2}
          >
            {user?.email || user?.displayName || "Signed in"}
          </Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => {
                void haptic.navigation();
                void setActiveWorkspace("expense");
              }}
              style={({ pressed }) => [
                styles.footerBtn,
                { backgroundColor: "rgba(16, 185, 129, 0.12)", flex: 1 },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Switch Space"
            >
              <ArrowLeftRight size={16} color={theme.colors.success} />
              <Text style={{ color: theme.colors.success, fontWeight: "700" }}>
                Switch Space
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void haptic.impact();
                void logout().catch((error) => logError("nutrition.logout", error));
              }}
              style={({ pressed }) => [
                styles.footerBtn,
                { backgroundColor: "rgba(239, 68, 68, 0.12)", flex: 1 },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
            >
              <LogOut size={16} color={theme.colors.destructive} />
              <Text style={{ color: theme.colors.destructive, fontWeight: "700" }}>
                Sign Out
              </Text>
            </Pressable>
          </View>
        </Card>
      </View>
    </PageShell>
  );
}

function GoalStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.goalCell, { backgroundColor: theme.colors.secondary }]}>
      <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontWeight: "800", fontSize: 18 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  goalsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  goalCell: {
    width: "48%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    gap: 4,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  settingTitle: {
    fontWeight: "700",
    fontSize: 15,
  },
  footerBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
