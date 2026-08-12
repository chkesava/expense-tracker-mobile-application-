import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { StyleSheet, Text, View } from "react-native";

export interface CircularProgressProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
  label?: string;
  valueColor?: string;
}

/**
 * Circular progress ring with optional gradient stroke.
 * Used by Daily Focus and similar dashboard metrics.
 */
export function CircularProgress({
  progress,
  size = 88,
  strokeWidth = 9,
  trackColor = "rgba(255,255,255,0.08)",
  gradientFrom = "#A855F7",
  gradientTo = "#3B82F6",
  label,
  valueColor = "#FFFFFF",
}: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;
  const gradientId = `cg_${size}_${Math.round(clamped)}`;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradientFrom} />
            <Stop offset="100%" stopColor={gradientTo} />
          </LinearGradient>
        </Defs>
        <Circle
          stroke={trackColor}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <Circle
          stroke={`url(#${gradientId})`}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.centerLabel}>
        <Text style={[styles.pctText, { color: valueColor }]}>
          {Math.round(clamped)}%
        </Text>
        {label ? <Text style={styles.subLabel}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  pctText: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  subLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(163, 176, 194, 0.9)",
    marginTop: 1,
  },
});
