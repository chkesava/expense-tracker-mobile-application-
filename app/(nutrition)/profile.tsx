import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Card, Input, Button } from '@/components/ui';
import { NutritionProfile, GoalType, ActivityLevel, DietPreference } from '@/shared/types/nutrition';

export default function NutritionProfileScreen() {
  const { theme } = useTheme();

  const [profile, setProfile] = useState<Partial<NutritionProfile>>({
    age: 30,
    gender: 'male',
    heightCm: 175,
    weightKg: 75,
    targetWeightKg: 70,
    goal: 'fat_loss',
    activityLevel: 'moderate',
    dietPreference: 'anything',
  });

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.space.md,
      gap: theme.space.md,
    },
    sectionTitle: {
      fontSize: theme.typography.md,
      fontWeight: 'bold',
      color: theme.colors.foreground,
      marginTop: theme.space.sm,
      marginBottom: theme.space.xs,
    },
    row: {
      flexDirection: 'row',
      gap: theme.space.md,
    },
    flex1: {
      flex: 1,
    },
    selectorGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.space.sm,
      marginTop: theme.space.xs,
    },
    chip: {
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      borderRadius: theme.radius.full,
      backgroundColor: theme.colors.secondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      color: theme.colors.secondaryForeground,
      fontSize: theme.typography.sm,
    },
    chipTextSelected: {
      color: theme.colors.primaryForeground,
      fontWeight: 'bold',
    },
    goalsCard: {
      padding: theme.space.md,
      backgroundColor: theme.colors.primary,
      marginTop: theme.space.md,
    },
    goalsTitle: {
      color: theme.colors.primaryForeground,
      fontSize: theme.typography.lg,
      fontWeight: 'bold',
      marginBottom: theme.space.sm,
    },
    goalsText: {
      color: theme.colors.primaryForeground,
      opacity: 0.9,
      marginBottom: 4,
    }
  });

  const goals: { label: string; value: GoalType }[] = [
    { label: 'Fat Loss', value: 'fat_loss' },
    { label: 'Muscle Gain', value: 'muscle_gain' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Lean Bulk', value: 'lean_bulk' },
  ];

  const activityLevels: { label: string; value: ActivityLevel }[] = [
    { label: 'Sedentary', value: 'sedentary' },
    { label: 'Light', value: 'light' },
    { label: 'Moderate', value: 'moderate' },
    { label: 'Active', value: 'active' },
    { label: 'Very Active', value: 'very_active' },
  ];

  const renderChip = (label: string, isSelected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, isSelected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={{ padding: theme.space.md }}>
        <Text style={styles.sectionTitle}>Basic Info</Text>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Input
              label="Age"
              keyboardType="numeric"
              value={profile.age?.toString()}
              onChangeText={(text) => setProfile({ ...profile, age: parseInt(text) || 0 })}
            />
          </View>
          <View style={styles.flex1}>
            <Input
              label="Gender"
              value={profile.gender}
              onChangeText={(text) => setProfile({ ...profile, gender: text as any })}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Body Metrics</Text>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Input
              label="Height (cm)"
              keyboardType="numeric"
              value={profile.heightCm?.toString()}
              onChangeText={(text) => setProfile({ ...profile, heightCm: parseInt(text) || 0 })}
            />
          </View>
          <View style={styles.flex1}>
            <Input
              label="Weight (kg)"
              keyboardType="numeric"
              value={profile.weightKg?.toString()}
              onChangeText={(text) => setProfile({ ...profile, weightKg: parseFloat(text) || 0 })}
            />
          </View>
        </View>
        <Input
          label="Target Weight (kg)"
          keyboardType="numeric"
          value={profile.targetWeightKg?.toString()}
          onChangeText={(text) => setProfile({ ...profile, targetWeightKg: parseFloat(text) || 0 })}
        />

        <Text style={styles.sectionTitle}>Primary Goal</Text>
        <View style={styles.selectorGroup}>
          {goals.map(g => renderChip(g.label, profile.goal === g.value, () => setProfile({ ...profile, goal: g.value })))}
        </View>

        <Text style={styles.sectionTitle}>Activity Level</Text>
        <View style={styles.selectorGroup}>
          {activityLevels.map(a => renderChip(a.label, profile.activityLevel === a.value, () => setProfile({ ...profile, activityLevel: a.value })))}
        </View>
      </Card>

      <Card style={styles.goalsCard}>
        <Text style={styles.goalsTitle}>Calculated Targets</Text>
        <Text style={styles.goalsText}>Daily Calories: 2,150 kcal</Text>
        <Text style={styles.goalsText}>Protein: 160g</Text>
        <Text style={styles.goalsText}>Carbs: 215g</Text>
        <Text style={styles.goalsText}>Fats: 70g</Text>
      </Card>

      <Button onPress={() => {}}>
        <Text style={{ color: "#FFF", fontWeight: "700" }}>Save Profile</Text>
      </Button>
    </ScrollView>
  );
}
