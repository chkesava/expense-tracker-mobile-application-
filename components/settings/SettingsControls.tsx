import { type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View, type SwitchProps } from "react-native";

import { Chip } from "@/components/ui/Chip";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

export function SettingsPanel({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}
    >
      {title ? (
        <View style={styles.panelHeader}>
          <Text
            style={[
              styles.panelTitle,
              { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.panelSubtitle, { color: theme.colors.mutedForeground }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

export function FieldLabel({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.mutedForeground,
        fontSize: theme.typography.xs,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );
}

/**
 * The one switch style for Spendly (SPENDLY-551): primary track when on,
 * theme thumbs. react-native-web ignores `thumbColor` while on and falls back
 * to teal, so `activeThumbColor` is passed as well (first fixed for the runway
 * sources list, SPENDLY-545). Use this instead of a bare `Switch`.
 */
export function ThemedSwitch({ value, ...props }: Omit<SwitchProps, "trackColor" | "thumbColor">) {
  const { theme } = useTheme();
  return (
    <Switch
      value={value}
      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      thumbColor={value ? theme.colors.primaryForeground : theme.colors.mutedForeground}
      {...({ activeThumbColor: theme.colors.primaryForeground } as object)}
      {...props}
    />
  );
}

export function RowSwitch({
  label,
  value,
  onValueChange,
  description,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  description?: string;
}) {
  const { theme } = useTheme();

  const handleToggle = () => {
    void haptic.selection();
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handleToggle}
      android_ripple={{
        color: withAlpha(theme.colors.primary, 0.08),
        borderless: false,
      }}
      style={styles.switchRow}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
          {label}
        </Text>
        {description ? (
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <ThemedSwitch value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </Pressable>
  );
}

/**
 * A single-choice row of options. SPENDLY-551: drawn with the outline `Chip`
 * used across Phases 3–5 instead of its own filled green chip.
 */
export function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chipWrap} accessibilityRole="radiogroup">
      {options.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={opt.value === selected}
          appearance="outline"
          accessibilityRole="radio"
          // Re-selecting the current option is a no-op, so it gets no tick.
          haptic={opt.value !== selected}
          onPress={() => onSelect(opt.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  panelHeader: {
    gap: 4,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  panelSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  panelBody: {
    gap: 14,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 52,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
