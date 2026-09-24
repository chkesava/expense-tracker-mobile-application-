import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMonthYear(month: number, year: number): string {
  if (!month || !year) return "";
  const name = MONTH_LONG[month - 1];
  return name ? `${name} ${year}` : "";
}

/**
 * Pick a month and year (SPENDLY-140).
 *
 * The recurring form asked for these as two free-text boxes — "Month (1-12)"
 * and "Year (e.g. 2026)" — which is a lot of ways to be wrong about something
 * with twelve valid answers. The repo has no date picker of any kind and no
 * picker dependency, so this is a small one built on the existing Modal;
 * `MonthDrawer` has the same grid but is welded to global month state.
 *
 * `month` is 1-12. A zero/NaN month or year means "unset", which the recurring
 * form uses to mean "start from whenever this was created".
 */
export function MonthYearSelect({
  month,
  year,
  onChange,
  label,
  placeholder = "Select month",
  clearable = false,
  minYear = 2000,
  maxYear = 2100,
}: {
  month: number;
  year: number;
  onChange: (next: { month: number; year: number }) => void;
  label?: string;
  placeholder?: string;
  /** Show a "Not set" action — for optional dates like the first debit month. */
  clearable?: boolean;
  minYear?: number;
  maxYear?: number;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [open, setOpen] = useState(false);
  // Year being browsed, which is not the selection until a month is tapped.
  const [browseYear, setBrowseYear] = useState(
    year || new Date().getFullYear()
  );

  const selected = formatMonthYear(month, year);

  const openPicker = () => {
    setBrowseYear(year || new Date().getFullYear());
    void haptic.selection();
    setOpen(true);
  };

  return (
    <View>
      {label ? (
        <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={openPicker}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : theme.colors.card,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${selected || placeholder}` : undefined}
      >
        <Text
          style={[
            styles.triggerText,
            {
              color: selected
                ? theme.colors.foreground
                : theme.colors.mutedForeground,
            },
          ]}
          numberOfLines={1}
        >
          {selected || placeholder}
        </Text>
        <ChevronDown size={18} color={theme.colors.mutedForeground} />
      </Pressable>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={label || "Select month"}
        maxHeight="60%"
      >
        <View style={styles.yearRow}>
          <Pressable
            onPress={() => setBrowseYear((y) => Math.max(minYear, y - 1))}
            disabled={browseYear <= minYear}
            style={({ pressed }) => [
              styles.yearStep,
              { opacity: browseYear <= minYear ? 0.3 : pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Previous year"
          >
            <ChevronLeft size={20} color={theme.colors.foreground} />
          </Pressable>
          <Text style={[styles.yearLabel, { color: theme.colors.foreground }]}>
            {browseYear}
          </Text>
          <Pressable
            onPress={() => setBrowseYear((y) => Math.min(maxYear, y + 1))}
            disabled={browseYear >= maxYear}
            style={({ pressed }) => [
              styles.yearStep,
              { opacity: browseYear >= maxYear ? 0.3 : pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Next year"
          >
            <ChevronRight size={20} color={theme.colors.foreground} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {MONTH_SHORT.map((short, index) => {
            const value = index + 1;
            const isSelected = value === month && browseYear === year;
            return (
              <Pressable
                key={short}
                onPress={() => {
                  void haptic.selection();
                  onChange({ month: value, year: browseYear });
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(15,23,42,0.04)",
                    borderColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${MONTH_LONG[index]} ${browseYear}`}
              >
                <Text
                  style={[
                    styles.cellText,
                    {
                      color: isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.foreground,
                    },
                  ]}
                >
                  {short}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {clearable ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              onChange({ month: 0, year: 0 });
              setOpen(false);
            }}
            style={({ pressed }) => [
              styles.clear,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.clearText, { color: theme.colors.mutedForeground }]}>
              Not set
            </Text>
          </Pressable>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  yearStep: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  yearLabel: {
    fontSize: 18,
    fontWeight: "800",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: "22%",
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    fontSize: 14,
    fontWeight: "700",
  },
  clear: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    marginTop: 12,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
