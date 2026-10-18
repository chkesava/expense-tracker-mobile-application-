import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useSettings } from "@/providers/SettingsProvider";
import {
  canShiftMonth,
  initialPickerMonth,
  isDateAllowed,
  isMonthAllowed,
  pickerMonthGrid,
  pickerMonthTitle,
  yearsInRange,
  type PickerLimits,
} from "@/shared/utils/datePicker";
import { shiftDateKey, shiftMonthKey, todayDateKey } from "@/shared/utils/dates";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const YEAR_ROW = 52; // jumpCell minHeight 44 + 8 gap

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Date picker panel (SPENDLY-557). A month grid shown inline under its
 * `DateField`, with a year → month jump for dates far away, Today, and Clear
 * for optional fields. Picks a `YYYY-MM-DD` key; days outside `min`/`max`
 * can't be chosen. On web, arrow keys move the highlighted day, Enter picks
 * it and Escape closes the panel.
 *
 * Inline rather than a sheet on purpose: most date fields already live inside
 * a sheet, and on web a second Gluestack modal on top of one doesn't receive
 * taps. Inline works the same in sheets, pages and on every platform.
 */
export function DatePickerPanel({
  isOpen,
  value,
  min,
  max,
  clearable = false,
  onPick,
  onClear,
  onClose,
}: {
  isOpen: boolean;
  value?: string;
  clearable?: boolean;
  onPick: (date: string) => void;
  onClear?: () => void;
  onClose: () => void;
} & PickerLimits) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const today = todayDateKey(settings?.timezone);
  const firstDay = settings?.firstDayOfWeek === "sunday" ? "sunday" : "monday";
  const range = useMemo(() => ({ min, max }), [min, max]);

  const [month, setMonth] = useState(() => initialPickerMonth(value, today, range));
  const [mode, setMode] = useState<"days" | "years" | "months">("days");
  const [jumpYear, setJumpYear] = useState(Number(month.slice(0, 4)));
  const [focus, setFocus] = useState<string | null>(null);
  const yearScroll = useRef<ScrollView>(null);

  // Reopen on the current value's month each time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    const m = initialPickerMonth(value, today, range);
    setMonth(m);
    setMode("days");
    setFocus(value && isDateAllowed(value, range) ? value : null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => pickerMonthGrid(month, firstDay, { selected: value, today, min, max }), [month, firstDay, value, today, min, max]);
  const years = useMemo(() => yearsInRange(today, range), [today, range]);
  const todayAllowed = isDateAllowed(today, range);

  // Web keyboard: arrows move the highlight, Enter picks.
  useEffect(() => {
    if (Platform.OS !== "web" || !isOpen || mode !== "days") return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : e.key === "ArrowDown" ? 7 : 0;
      if (step) {
        e.preventDefault();
        const from = focus ?? (value && isDateAllowed(value, range) ? value : todayAllowed ? today : `${month}-01`);
        const next = shiftDateKey(from, step);
        if (!isDateAllowed(next, range)) return;
        setFocus(next);
        if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
      } else if (e.key === "Enter" && focus && isDateAllowed(focus, range)) {
        // Claim Enter before the DateField button (which keeps focus) toggles the panel shut.
        e.preventDefault();
        e.stopPropagation();
        onPick(focus);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, mode, focus, value, month, range, today, todayAllowed, onPick, onClose]);

  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs };
  const navButton = (delta: number) => {
    const enabled = canShiftMonth(month, delta, range);
    const Icon = delta < 0 ? ChevronLeft : ChevronRight;
    return (
      <Pressable
        onPress={() => enabled && setMonth(shiftMonthKey(month, delta))}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel={delta < 0 ? `Previous month, ${pickerMonthTitle(shiftMonthKey(month, -1))}` : `Next month, ${pickerMonthTitle(shiftMonthKey(month, 1))}`}
        accessibilityState={{ disabled: !enabled }}
        hitSlop={6}
        style={[styles.navButton, { opacity: enabled ? 1 : 0.3 }]}
      >
        <Icon size={22} color={theme.colors.foreground} />
      </Pressable>
    );
  };

  const header = (
    <View style={styles.header}>
      {mode === "days" ? navButton(-1) : <View style={styles.navButton} />}
      <Pressable
        onPress={() => {
          setJumpYear(Number(month.slice(0, 4)));
          setMode(mode === "days" ? "years" : "days");
        }}
        accessibilityRole="button"
        accessibilityLabel={mode === "days" ? `${pickerMonthTitle(month)}. Choose a different month or year` : "Back to the days"}
        style={[styles.titleButton, { borderRadius: theme.radius.md }]}
      >
        <Text style={[text, { fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }]}>
          {mode === "months" ? String(jumpYear) : pickerMonthTitle(month)}
        </Text>
        <ChevronDown size={16} color={theme.colors.mutedForeground} style={{ transform: [{ rotate: mode === "days" ? "0deg" : "180deg" }] }} />
      </Pressable>
      {mode === "days" ? navButton(1) : <View style={styles.navButton} />}
    </View>
  );

  const days = (
    <View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {grid.weekdays.map((w) => (
          <Text key={w} style={[muted, styles.weekday]}>
            {w}
          </Text>
        ))}
      </View>
      {grid.weeks.map((week) => (
        <View key={week[0].date} style={styles.row}>
          {week.map((c) => {
            const focused = focus === c.date && !c.isSelected;
            const fg = c.isSelected ? theme.colors.primaryForeground : c.inMonth ? theme.colors.foreground : theme.colors.mutedForeground;
            return (
              <Pressable
                key={c.date}
                onPress={() => onPick(c.date)}
                disabled={c.disabled}
                accessibilityRole="button"
                accessibilityLabel={c.accessibilityLabel}
                accessibilityState={{ selected: c.isSelected, disabled: c.disabled }}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    borderRadius: theme.radius.md,
                    backgroundColor: c.isSelected ? theme.colors.primary : focused ? withAlpha(theme.colors.primary, 0.16) : pressed ? withAlpha(theme.colors.primary, 0.1) : "transparent",
                    borderWidth: c.isToday && !c.isSelected ? 1.5 : 0,
                    borderColor: theme.colors.primary,
                    opacity: c.disabled ? 0.3 : c.inMonth ? 1 : 0.55,
                  },
                ]}
              >
                <Text style={{ color: fg, fontFamily: c.isSelected || c.isToday ? theme.fontFamily.bold : theme.fontFamily.regular, fontSize: theme.typography.sm }}>{c.day}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );

  const yearList = (
    <ScrollView
      ref={yearScroll}
      style={{ maxHeight: 264 }}
      contentContainerStyle={styles.jumpGrid}
      // Open on the shown year's row instead of the top of a 100-year list.
      onContentSizeChange={() => {
        const row = Math.floor(Math.max(0, years.indexOf(Number(month.slice(0, 4)))) / 3);
        yearScroll.current?.scrollTo({ y: Math.max(0, (row - 1) * YEAR_ROW), animated: false });
      }}
    >
      {years.map((y) => {
        const selected = y === Number(month.slice(0, 4));
        return (
          <Pressable
            key={y}
            onPress={() => {
              setJumpYear(y);
              setMode("months");
            }}
            accessibilityRole="button"
            accessibilityLabel={`${y}${selected ? ", current" : ""}`}
            style={[styles.jumpCell, { borderRadius: theme.radius.md, backgroundColor: selected ? withAlpha(theme.colors.primary, 0.16) : surfaces.tile }]}
          >
            <Text style={[text, { color: selected ? theme.colors.primary : theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{y}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const monthList = (
    <View style={styles.jumpGrid}>
      {MONTHS_SHORT.map((label, i) => {
        const key = `${jumpYear}-${String(i + 1).padStart(2, "0")}`;
        const allowed = isMonthAllowed(key, range);
        const selected = key === month;
        return (
          <Pressable
            key={key}
            onPress={() => {
              setMonth(key);
              setMode("days");
            }}
            disabled={!allowed}
            accessibilityRole="button"
            accessibilityLabel={`${pickerMonthTitle(key)}${allowed ? "" : ", unavailable"}`}
            accessibilityState={{ disabled: !allowed, selected }}
            style={[styles.jumpCell, { borderRadius: theme.radius.md, opacity: allowed ? 1 : 0.3, backgroundColor: selected ? withAlpha(theme.colors.primary, 0.16) : surfaces.tile }]}
          >
            <Text style={[text, { color: selected ? theme.colors.primary : theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      style={[styles.panel, { gap: theme.space.sm, borderColor: theme.colors.border, borderRadius: theme.radius.lg, backgroundColor: theme.colors.card, padding: theme.space.sm }]}
    >
        {header}
        {mode === "days" ? days : mode === "years" ? yearList : monthList}
        <View style={styles.footer}>
          {todayAllowed ? (
            <Button variant="tonal" size="sm" onPress={() => onPick(today)} accessibilityLabel="Pick today">
              Today
            </Button>
          ) : null}
          {clearable && value ? (
            <Button variant="ghost" size="sm" onPress={() => onClear?.()} accessibilityLabel="Clear the date">
              Clear
            </Button>
          ) : null}
          <View style={{ flex: 1 }} />
          <Button variant="ghost" size="sm" onPress={onClose}>
            Close
          </Button>
        </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  titleButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 },
  row: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", paddingVertical: 4 },
  cell: { flex: 1, minHeight: 44, margin: 1, alignItems: "center", justifyContent: "center" },
  jumpGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  jumpCell: { flexBasis: "30%", flexGrow: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
