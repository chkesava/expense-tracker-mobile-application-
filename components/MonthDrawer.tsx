import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react-native";
import { Modal } from "@/components/common/Modal";
import { useModals } from "@/providers/ModalProvider";
import { currentMonthKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

const MONTH_NAMES = [
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

export function MonthDrawer() {
  const { isMonthDrawerOpen, setIsMonthDrawerOpen, globalMonth, setGlobalMonth } = useModals();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const activeMonthKey = globalMonth || currentMonthKey();
  const [activeYearStr, activeMonthStr] = activeMonthKey.split("-");
  const [selectedYear, setSelectedYear] = useState<number>(() => parseInt(activeYearStr, 10) || new Date().getFullYear());

  const currentCalMonthKey = currentMonthKey();

  const handleSelectMonth = (monthIndex: number) => {
    haptic.selection().catch(() => undefined);
    const monthFormatted = String(monthIndex + 1).padStart(2, "0");
    const newMonthKey = `${selectedYear}-${monthFormatted}`;
    setGlobalMonth(newMonthKey);
    setIsMonthDrawerOpen(false);
  };

  const handleResetCurrent = () => {
    haptic.selection().catch(() => undefined);
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setGlobalMonth(currentCalMonthKey);
    setIsMonthDrawerOpen(false);
  };

  return (
    <Modal
      isOpen={isMonthDrawerOpen}
      onClose={() => setIsMonthDrawerOpen(false)}
      title="Select Month"
    >
      <View style={styles.container}>
        {/* Year Selector */}
        <View
          style={[
            styles.yearSelector,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            onPress={() => setSelectedYear((y) => y - 1)}
            style={({ pressed }) => [styles.yearNavButton, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Previous year"
          >
            <ChevronLeft size={20} color={theme.colors.foreground} />
          </Pressable>

          <Text style={[styles.yearText, { color: theme.colors.foreground, fontSize: theme.typography.lg }]}>
            {selectedYear}
          </Text>

          <Pressable
            onPress={() => setSelectedYear((y) => y + 1)}
            style={({ pressed }) => [styles.yearNavButton, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Next year"
          >
            <ChevronRight size={20} color={theme.colors.foreground} />
          </Pressable>
        </View>

        {/* Month Grid */}
        <View style={styles.grid}>
          {MONTH_SHORT.map((shortName, index) => {
            const monthFormatted = String(index + 1).padStart(2, "0");
            const itemKey = `${selectedYear}-${monthFormatted}`;
            const isSelected = itemKey === activeMonthKey;
            const isCurrentMonth = itemKey === currentCalMonthKey;

            return (
              <Pressable
                key={shortName}
                onPress={() => handleSelectMonth(index)}
                style={({ pressed }) => [
                  styles.monthButton,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.03)",
                    borderColor: isSelected
                      ? theme.colors.primary
                      : isCurrentMonth
                        ? theme.colors.primary
                        : theme.colors.border,
                    borderWidth: isCurrentMonth || isSelected ? 1.5 : 1,
                  },
                  pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] },
                ]}
              >
                <Text
                  style={[
                    styles.monthText,
                    {
                      color: isSelected
                        ? theme.colors.primaryForeground
                        : theme.colors.foreground,
                      fontWeight: isSelected ? "800" : "600",
                      fontSize: theme.typography.sm,
                    },
                  ]}
                >
                  {shortName}
                </Text>
                {isCurrentMonth && !isSelected ? (
                  <View style={[styles.currentDot, { backgroundColor: theme.colors.primary }]} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* This Month shortcut button */}
        <Pressable
          onPress={handleResetCurrent}
          style={({ pressed }) => [
            styles.resetButton,
            {
              borderColor: theme.colors.border,
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <CalendarIcon size={16} color={theme.colors.primary} />
          <Text style={[styles.resetButtonText, { color: theme.colors.foreground, fontSize: theme.typography.sm }]}>
            Jump to Current Month ({MONTH_NAMES[new Date().getMonth()]})
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default MonthDrawer;

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  yearSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  yearNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  yearText: {
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  monthButton: {
    width: "31%",
    aspectRatio: 1.8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  monthText: {
    letterSpacing: 0.2,
  },
  currentDot: {
    position: "absolute",
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 4,
  },
  resetButtonText: {
    fontWeight: "700",
  },
});
