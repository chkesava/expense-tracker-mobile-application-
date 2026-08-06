import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/ui';
import { MacroProgressBar } from '@/components/nutrition/MacroProgressBar';
import { MealPlannerCard } from '@/components/nutrition/MealPlannerCard';
import { Droplet, Activity, TrendingDown } from 'lucide-react-native';
import { Meal } from '@/shared/types/nutrition';
import { useRouter } from 'expo-router';

export default function NutritionDashboard() {
  const { theme } = useTheme();
  const router = useRouter();

  const [waterLogged, setWaterLogged] = useState(1200);
  const waterTarget = 3000;

  // Mock data for display
  const meals: Meal[] = [
    {
      id: '1',
      name: 'Breakfast',
      order: 1,
      totals: { calories: 450, protein: 25, carbs: 45, fat: 15, fiber: 5 },
      foods: [
        { id: 'f1', name: 'Oatmeal', quantity: '1 cup', nutrients: { calories: 300, protein: 10, carbs: 54, fat: 5, fiber: 8 } },
        { id: 'f2', name: 'Eggs', quantity: '2 large', nutrients: { calories: 140, protein: 12, carbs: 1, fat: 10, fiber: 0 } },
      ],
    },
    {
      id: '2',
      name: 'Lunch',
      order: 2,
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      foods: [],
    },
  ];

  const macros = {
    calories: { consumed: 1200, target: 2400, color: theme.colors.primary },
    protein: { consumed: 85, target: 150, color: '#34B37A' }, // success
    carbs: { consumed: 120, target: 250, color: '#F59E0B' }, // warning
    fats: { consumed: 40, target: 70, color: '#EF4444' }, // destructive
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.space.md,
    },
    sectionTitle: {
      fontSize: theme.typography.lg,
      fontWeight: 'bold',
      color: theme.colors.foreground,
      marginTop: theme.space.md,
      marginBottom: theme.space.sm,
    },
    macrosCard: {
      padding: theme.space.md,
      marginBottom: theme.space.md,
      flexDirection: 'row',
      justifyContent: 'space-around',
      flexWrap: 'wrap',
    },
    waterCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.space.md,
      marginBottom: theme.space.md,
    },
    waterInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.md,
    },
    waterText: {
      color: theme.colors.foreground,
      fontSize: theme.typography.md,
      fontWeight: '600',
    },
    waterSubText: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.sm,
    },
    addWaterBtn: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      borderRadius: theme.radius.full,
    },
    addWaterText: {
      color: theme.colors.primaryForeground,
      fontWeight: 'bold',
    },
    summaryCards: {
      flexDirection: 'row',
      gap: theme.space.md,
      marginBottom: theme.space.md,
    },
    summaryCard: {
      flex: 1,
      padding: theme.space.md,
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: theme.typography.xl,
      fontWeight: 'bold',
      color: theme.colors.foreground,
      marginVertical: theme.space.xs,
    },
    summaryLabel: {
      fontSize: theme.typography.xs,
      color: theme.colors.mutedForeground,
    }
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Today's Progress</Text>
      <Card style={styles.macrosCard}>
        <MacroProgressBar label="Calories" consumed={macros.calories.consumed} target={macros.calories.target} color={macros.calories.color} size={100} strokeWidth={10} />
        <MacroProgressBar label="Protein" consumed={macros.protein.consumed} target={macros.protein.target} color={macros.protein.color} />
        <MacroProgressBar label="Carbs" consumed={macros.carbs.consumed} target={macros.carbs.target} color={macros.carbs.color} />
        <MacroProgressBar label="Fats" consumed={macros.fats.consumed} target={macros.fats.target} color={macros.fats.color} />
      </Card>

      <Card style={styles.waterCard}>
        <View style={styles.waterInfo}>
          <Droplet color="#3b82f6" size={32} />
          <View>
            <Text style={styles.waterText}>{waterLogged} / {waterTarget} ml</Text>
            <Text style={styles.waterSubText}>Daily Water Goal</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addWaterBtn} onPress={() => setWaterLogged(w => w + 250)}>
          <Text style={styles.addWaterText}>+ 250ml</Text>
        </TouchableOpacity>
      </Card>

      <View style={styles.summaryCards}>
        <Card style={styles.summaryCard}>
          <Activity color={theme.colors.success} size={24} />
          <Text style={styles.summaryValue}>350</Text>
          <Text style={styles.summaryLabel}>Active Cals</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <TrendingDown color={theme.colors.primary} size={24} />
          <Text style={styles.summaryValue}>75.5 kg</Text>
          <Text style={styles.summaryLabel}>Current Weight</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Meals</Text>
      {meals.map(meal => (
        <MealPlannerCard
          key={meal.id}
          meal={meal}
          onAddFood={() => router.push('/(nutrition)/log')}
        />
      ))}
    </ScrollView>
  );
}
