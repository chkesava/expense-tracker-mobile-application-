import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { useGaneshTokens } from "./tokens";

export type MoreDetailsProps = {
  children: ReactNode;
  label?: string;
  /** How many of the hidden fields already have a value. Shown as a hint. */
  filledCount?: number;
  /** Start expanded — use when editing a record that already has these fields. */
  defaultOpen?: boolean;
};

/**
 * Progressive disclosure for optional form fields.
 *
 * Recording a collection or an expense should take seconds, so the required
 * fields stand alone and everything optional lives behind this. Ten fields on
 * screen at once is what made the old forms feel like data entry rather than a
 * quick note.
 */
export function MoreDetails({
  children,
  label = "More details",
  filledCount = 0,
  defaultOpen = false,
}: MoreDetailsProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const [open, setOpen] = useState(defaultOpen || filledCount > 0);

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          void haptic.selection();
          setOpen((prev) => !prev);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        android_ripple={{
          color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
          borderless: false,
        }}
        style={({ pressed }) => [
          styles.toggle,
          { backgroundColor: g.tile },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text
          style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
        >
          {label}
        </Text>
        {!open && filledCount > 0 ? (
          <Text
            style={[
              styles.count,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
            ]}
          >
            {filledCount} filled
          </Text>
        ) : null}
        <Chevron size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
      </Pressable>

      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  count: {
    fontSize: 12,
  },
  body: {
    gap: 12,
  },
});
