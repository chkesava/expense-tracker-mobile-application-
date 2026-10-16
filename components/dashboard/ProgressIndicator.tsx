import { memo, useEffect, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useSurfaces } from "@/components/dashboard/primitives";
import { easing, useMotionReduced, valueMotion } from "@/theme/motion";
import { useTheme } from "@/theme/ThemeProvider";

/** Progress status. Each one has a word, so it never relies on colour alone. */
export type ProgressStatus = "neutral" | "good" | "watch" | "over";

export type ProgressIndicatorProps = {
  /** 0–100+. Values past 100 fill the bar and keep their `status`. */
  pct: number;
  status?: ProgressStatus;
  /** Left caption above the bar, e.g. a category or goal name. */
  label?: string;
  /** Leading node beside the label, e.g. a category glyph. */
  leading?: ReactNode;
  /** Right caption above the bar, e.g. "₹2,400 / ₹5,000". */
  value?: ReactNode;
  /** Short status word under the bar, e.g. "On track", "Over by ₹600". */
  statusLabel?: string;
  /** Right-aligned note under the bar, e.g. "48%". */
  trailing?: string;
  height?: number;
  /** Override the fill colour (otherwise from `status`). */
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * SPENDLY-533 — the dashboard's one progress row: optional caption line, an
 * animated bar that grows only when its value changes (instantly under reduced
 * motion), and a status line spelled out in words.
 */
export const ProgressIndicator = memo(function ProgressIndicator({
  pct,
  status = "neutral",
  label,
  leading,
  value,
  statusLabel,
  trailing,
  height = 6,
  color,
  accessibilityLabel,
  style,
}: ProgressIndicatorProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const reduced = useMotionReduced();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const target = clamped === 0 ? 0 : Math.max(2, clamped);

  const fill =
    color ??
    (status === "over"
      ? theme.colors.destructive
      : status === "watch"
        ? theme.colors.warning
        : status === "good"
          ? theme.colors.success
          : theme.colors.primary);
  const statusColor =
    status === "over"
      ? theme.colors.destructive
      : status === "watch"
        ? theme.colors.warning
        : status === "good"
          ? theme.colors.success
          : theme.colors.mutedForeground;

  const width = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    width.value = reduced
      ? target
      : withTiming(target, { duration: valueMotion.grow.duration, easing: easing.standard });
  }, [target, reduced, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={[styles.wrap, style]}>
      {label || value || leading ? (
        <View style={styles.captionRow}>
          <View style={styles.captionLeft}>
            {leading}
            {label ? (
              <Text
                style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            ) : null}
          </View>
          {value ? <View style={styles.captionRight}>{value}</View> : null}
        </View>
      ) : null}

      <View
        style={[styles.track, { height, borderRadius: height / 2, backgroundColor: surfaces.track }]}
        accessibilityRole="progressbar"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: statusLabel }}
      >
        <Animated.View
          style={[{ height: "100%", borderRadius: height / 2, backgroundColor: fill }, fillStyle]}
        />
      </View>

      {statusLabel || trailing ? (
        <View style={styles.statusRow}>
          {statusLabel ? (
            <Text
              style={[styles.status, { color: statusColor, fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          ) : (
            <View />
          )}
          {trailing ? (
            <Text
              style={[styles.status, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}
              numberOfLines={1}
            >
              {trailing}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  captionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  captionRight: {
    alignItems: "flex-end",
    flexShrink: 0,
    maxWidth: "55%",
  },
  label: {
    fontSize: 13.5,
    flexShrink: 1,
  },
  track: {
    overflow: "hidden",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  status: {
    fontSize: 11.5,
  },
});
