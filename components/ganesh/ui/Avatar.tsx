import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens, withAlpha } from "./tokens";

/**
 * Deterministic tint per person, drawn from a non-semantic ramp.
 *
 * Deliberately excludes success green and destructive red: a member's avatar
 * must never read as "good" or "bad".
 */
const RAMP = ["#7C5CFC", "#EC4899", "#F59E0B", "#0EA5E9", "#14B8A6", "#6366F1"] as const;

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return RAMP[hash % RAMP.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export type AvatarProps = {
  name: string;
  size?: number;
  /** Seed the tint on a stable id rather than the display name. */
  seed?: string;
};

/** Initials avatar for people rows. */
export function Avatar({ name, size = 40, seed }: AvatarProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const tint = tintFor(seed || name || "?");

  return (
    <View
      accessible={false}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(tint, g.isDark ? 0.22 : 0.13),
        },
      ]}
    >
      <Text
        style={{
          color: tint,
          fontSize: size * 0.36,
          letterSpacing: 0.2,
          fontFamily: theme.fontFamily.semibold,
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
