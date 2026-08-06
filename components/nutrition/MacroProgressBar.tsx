import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface MacroProgressBarProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}

export function MacroProgressBar({
  label,
  consumed,
  target,
  color,
  size = 80,
  strokeWidth = 8,
}: MacroProgressBarProps) {
  const { theme } = useTheme();
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const strokeDashoffset = circumference - progress * circumference;
  
  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    labelContainer: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: theme.typography.xs,
      color: theme.colors.mutedForeground,
      marginBottom: 2,
    },
    value: {
      fontSize: theme.typography.sm,
      fontWeight: 'bold',
      color: theme.colors.foreground,
    },
  });

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <Circle
          stroke={theme.colors.muted}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke={color}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.value}>{Math.round(consumed)}</Text>
      </View>
    </View>
  );
}
