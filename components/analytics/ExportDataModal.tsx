import { appDialog } from "@/lib/appDialog";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Download, FileSpreadsheet, FileText, Lock, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  generateTransactionsCsv,
  generateTransactionsJson,
} from "@/shared/utils/csvExport";
import { currentMonthKey, isInMonth, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { friendlyErrorMessage, logWarning } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useSettings } from "@/providers/SettingsProvider";

export interface ExportDataModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ExportDataModal({ visible, onClose }: ExportDataModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const displayCurrency = useDisplayCurrency();
  const { settings, setExportYear } = useSettings();

  const { expenses, complete: expensesComplete } = useExpenses();
  const { incomes, complete: incomesComplete } = useIncomes();
  /**
   * SPENDLY-113 — `loading` goes false on the staged 300-row page, so anything
   * gated on it could ship a silently truncated file. These are the real flags.
   */
  const ledgerComplete = expensesComplete && incomesComplete;
  const { accounts } = useAccounts();

  const [scope, setScope] = useState<"all" | "year" | "month">("all");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [isExporting, setIsExporting] = useState(false);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const currentMonth = useMemo(() => currentMonthKey(), []);

  /** Years the user actually has data for, newest first, always including now. */
  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    [...expenses, ...incomes].forEach((row) => {
      const year = Number(row.date?.slice(0, 4));
      if (Number.isFinite(year) && year > 1970) years.add(year);
    });
    return [...years].sort((a, b) => b - a);
  }, [expenses, incomes]);

  const selectedYear = availableYears.includes(settings.exportYear)
    ? settings.exportYear
    : availableYears[0];
  const selectedYearStr = String(selectedYear);

  const filteredData = useMemo(() => {
    if (scope === "year") {
      return {
        expenses: expenses.filter((e) => e.date?.startsWith(selectedYearStr)),
        incomes: incomes.filter((inc) => inc.date?.startsWith(selectedYearStr)),
      };
    }
    if (scope === "month") {
      return {
        expenses: expenses.filter((e) => isInMonth(e, currentMonth)),
        incomes: incomes.filter((inc) => isInMonth(inc, currentMonth)),
      };
    }
    return { expenses, incomes };
  }, [expenses, incomes, scope, selectedYearStr, currentMonth]);

  const handleExport = async () => {
    if (!system.allowDataExport) {
      appDialog.alert(
        "Export Disabled",
        "Data export is currently disabled by system policy."
      );
      return;
    }

    if (!ledgerComplete) {
      appDialog.alert(
        "Still loading your full history",
        "Exporting now would leave rows out. Try again in a moment."
      );
      return;
    }

    setIsExporting(true);
    try {
      let content = "";
      let title = "";

      if (format === "csv") {
        content = generateTransactionsCsv(
          filteredData.expenses,
          filteredData.incomes,
          {
            currency: displayCurrency,
            accountMap,
          }
        );
        title = `Expense_Tracker_Export_${scope}_${todayDateKey()}.csv`;
      } else {
        content = generateTransactionsJson(
          filteredData.expenses,
          filteredData.incomes,
          {
            currency: displayCurrency,
            accountMap,
          }
        );
        title = `Expense_Tracker_Export_${scope}_${todayDateKey()}.json`;
      }

      await Share.share({
        message: content,
        title,
      });

      haptic.success().catch(
        () => undefined
      );
      onClose();
    } catch (err) {
      // Was silent: a failed export told the user nothing at all.
      logWarning("exportDataModal.export", err);
      toast.error(friendlyErrorMessage(err, "Could not create the export."));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>
                Export Financial Data
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
                Download or share your transaction logs
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          {!system.allowDataExport ? (
            <View
              style={[
                styles.lockedBanner,
                {
                  backgroundColor: isDark
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(239,68,68,0.06)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Lock size={20} color="#EF4444" />
              <Text style={[styles.lockedText, { color: theme.colors.foreground }]}>
                Data export is disabled in system configuration settings.
              </Text>
            </View>
          ) : (
            <View style={styles.body}>
              {/* SPENDLY-113 — worded to match the Journal's own truncation
                  notice, so two screens can never contradict each other. */}
              {!ledgerComplete ? (
                <View
                  style={[
                    styles.lockedBanner,
                    {
                      backgroundColor: isDark
                        ? "rgba(245,158,11,0.10)"
                        : "rgba(245,158,11,0.08)",
                      borderColor: theme.colors.warning,
                    },
                  ]}
                >
                  <Text style={[styles.lockedText, { color: theme.colors.foreground }]}>
                    Still loading your full history — exports stay disabled until
                    the rest of your transactions load, so a file can never be
                    missing rows.
                  </Text>
                </View>
              ) : null}

              {/* Scope Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
                  EXPORT RANGE
                </Text>
                <View style={styles.chipRow}>
                  {(
                    [
                      {
                        id: "all",
                        label: `All History (${expenses.length + incomes.length})${
                          ledgerComplete ? "" : " so far"
                        }`,
                      },
                      { id: "year", label: `Year (${selectedYearStr})` },
                      { id: "month", label: `This Month (${currentMonth})` },
                    ] as const
                  ).map((s) => {
                    const isSelected = scope === s.id;
                    return (
                      <Chip
                        key={s.id}
                        label={s.label}
                        selected={isSelected}
                        onPress={() => setScope(s.id)}
                      />
                    );
                  })}
                </View>
                {scope === "year" && availableYears.length > 1 ? (
                  <View style={styles.chipRow}>
                    {availableYears.map((year) => {
                      const isSelected = year === selectedYear;
                      return (
                        <Pressable
                          key={year}
                          onPress={() => {
                            haptic.selection().catch(() => undefined);
                            setExportYear(year);
                          }}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: isSelected
                                ? theme.colors.primary
                                : theme.colors.surfaceVariant,
                              borderColor: isSelected
                                ? theme.colors.primary
                                : theme.colors.border,
                            },
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={{
                              color: isSelected
                                ? "#FFFFFF"
                                : theme.colors.foreground,
                              fontWeight: isSelected ? "700" : "500",
                              fontSize: 13,
                            }}
                          >
                            {year}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {/* Format Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
                  FORMAT
                </Text>
                <View style={styles.formatRow}>
                  <Pressable
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setFormat("csv");
                    }}
                    style={[
                      styles.formatCard,
                      {
                        backgroundColor: format === "csv"
                          ? isDark
                            ? "rgba(99,102,241,0.15)"
                            : "rgba(99,102,241,0.08)"
                          : "transparent",
                        borderColor: format === "csv" ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <FileSpreadsheet
                      size={24}
                      color={format === "csv" ? theme.colors.primary : theme.colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.formatTitle,
                        { color: format === "csv" ? theme.colors.primary : theme.colors.foreground },
                      ]}
                    >
                      CSV Spreadsheet
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                      Excel / Numbers compatible
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      haptic.selection().catch(() => undefined);
                      setFormat("json");
                    }}
                    style={[
                      styles.formatCard,
                      {
                        backgroundColor: format === "json"
                          ? isDark
                            ? "rgba(99,102,241,0.15)"
                            : "rgba(99,102,241,0.08)"
                          : "transparent",
                        borderColor: format === "json" ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <FileText
                      size={24}
                      color={format === "json" ? theme.colors.primary : theme.colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.formatTitle,
                        { color: format === "json" ? theme.colors.primary : theme.colors.foreground },
                      ]}
                    >
                      JSON Data
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                      Raw structured objects
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Action Button */}
              <Button
                onPress={handleExport}
                disabled={isExporting || !ledgerComplete}
                style={{ marginTop: 8 }}
              >
                <Download size={18} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
                  {isExporting
                    ? "Generating..."
                    : ledgerComplete
                      ? "Export & Share"
                      : "Still loading…"}
                </Text>
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: {
    padding: 4,
  },
  lockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  lockedText: {
    fontSize: 13,
    flex: 1,
  },
  body: {
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  chipRow: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
  },
  formatRow: {
    flexDirection: "row",
    gap: 10,
  },
  formatCard: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  formatTitle: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
});
