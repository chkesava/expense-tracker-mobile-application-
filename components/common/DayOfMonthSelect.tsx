import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

/** Days that do not exist in every month, so the charge lands on the last day. */
const SHORT_MONTH_DAYS = new Set([29, 30, 31]);

/**
 * Pick a billing day of the month (SPENDLY-140).
 *
 * All 31 days stay selectable. The auto-poster already clamps to the real
 * length of each month, so day 31 has always meant "the last day" in practice —
 * refusing it here would block anyone with a month-end charge from saving an
 * unrelated edit. Instead the consequence is stated out loud, which is the part
 * that was missing.
 */
export function DayOfMonthSelect({
  value,
  onChange,
  label,
}: {
  /** 1-31. Anything outside that shows as unset. */
  value: number;
  onChange: (day: number) => void;
  label?: string;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [open, setOpen] = useState(false);

  const valid = Number.isFinite(value) && value >= 1 && value <= 31;

  return (
    <View>
      {label ? (
        <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={() => {
          void haptic.selection();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : theme.colors.card,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          label ? `${label}: ${valid ? value : "not set"}` : undefined
        }
      >
        <Text
          style={[
            styles.triggerText,
            {
              color: valid ? theme.colors.foreground : theme.colors.mutedForeground,
            },
          ]}
        >
          {valid ? String(value) : "Select day"}
        </Text>
        <ChevronDown size={18} color={theme.colors.mutedForeground} />
      </Pressable>

      {valid && SHORT_MONTH_DAYS.has(value) ? (
        <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
          Months without a {value}
          {value === 31 ? "st" : "th"} charge on the last day.
        </Text>
      ) : null}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={label || "Billing day"}
        maxHeight="70%"
      >
        <View style={styles.grid}>
          {DAYS.map((day) => {
            const isSelected = day === value;
            return (
              <Pressable
                key={day}
                onPress={() => {
                  void haptic.selection();
                  onChange(day);
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
                accessibilityLabel={`Day ${day}`}
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
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sheetNote, { color: theme.colors.mutedForeground }]}>
          Days 29-31 charge on the last day of any shorter month.
        </Text>
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
  hint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "500",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: "16%",
    flexGrow: 1,
    minHeight: 46,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    fontSize: 14,
    fontWeight: "700",
  },
  sheetNote: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "500",
  },
});
