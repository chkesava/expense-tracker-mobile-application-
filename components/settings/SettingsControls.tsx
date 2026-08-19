import { type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { ACCOUNT_GREEN } from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function SettingsPanel({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
        },
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
        color: theme.colors.primary + "14",
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
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor="#FFFFFF"
      />
    </Pressable>
  );
}

export function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onSelect(opt.value);
            }}
            android_ripple={{
              color: active ? "rgba(15,23,42,0.12)" : theme.colors.primary + "1A",
              borderless: false,
            }}
            style={[
              styles.chip,
              {
                borderColor: active
                  ? ACCOUNT_GREEN
                  : isDark
                    ? "rgba(148,163,184,0.16)"
                    : theme.colors.border,
                backgroundColor: active
                  ? ACCOUNT_GREEN
                  : isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.03)",
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={{
                color: active ? "#052E16" : theme.colors.foreground,
                fontSize: 13,
                fontWeight: active ? "800" : "600",
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
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
  chip: {
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
  },
});
