import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/ui';
import { Plus, Search, ScanBarcode } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Meal, FoodItem } from '@/shared/types/nutrition';

interface MealPlannerCardProps {
  meal: Meal;
  onAddFood: (mealId: string) => void;
}

export function MealPlannerCard({ meal, onAddFood }: MealPlannerCardProps) {
  const { theme } = useTheme();
  const router = useRouter();

  const styles = StyleSheet.create({
    card: {
      marginBottom: theme.space.md,
      padding: theme.space.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.space.sm,
    },
    title: {
      fontSize: theme.typography.md,
      fontWeight: 'bold',
      color: theme.colors.foreground,
    },
    totals: {
      fontSize: theme.typography.sm,
      color: theme.colors.mutedForeground,
    },
    foodItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: theme.space.xs,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    foodName: {
      fontSize: theme.typography.sm,
      color: theme.colors.foreground,
    },
    foodDetails: {
      fontSize: theme.typography.xs,
      color: theme.colors.mutedForeground,
    },
    actions: {
      flexDirection: 'row',
      marginTop: theme.space.md,
      gap: theme.space.sm,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space.sm,
      backgroundColor: theme.colors.secondary,
      borderRadius: theme.radius.sm,
      gap: theme.space.xs,
    },
    actionText: {
      fontSize: theme.typography.sm,
      color: theme.colors.secondaryForeground,
      fontWeight: '500',
    },
  });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{meal.name}</Text>
        <Text style={styles.totals}>{Math.round(meal.totals.calories)} kcal</Text>
      </View>

      {meal.foods.map((food, idx) => (
        <View key={food.id || idx.toString()} style={styles.foodItem}>
          <View>
            <Text style={styles.foodName}>{food.name}</Text>
            <Text style={styles.foodDetails}>{food.quantity}</Text>
          </View>
          <Text style={styles.foodDetails}>{Math.round(food.nutrients.calories)} kcal</Text>
        </View>
      ))}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onAddFood(meal.id)}>
          <Search size={16} color={theme.colors.secondaryForeground} />
          <Text style={styles.actionText}>Add Food</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/(nutrition)/scanner')}>
          <ScanBarcode size={16} color={theme.colors.secondaryForeground} />
          <Text style={styles.actionText}>Scan</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}
