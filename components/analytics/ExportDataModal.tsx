import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Download, FileSpreadsheet, FileText, Lock, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAccounts } from "@/hooks/useAccounts";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import {
  generateTransactionsCsv,
  generateTransactionsJson,
} from "@/shared/utils/csvExport";
import { currentMonthKey, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { logWarning } from "@/lib/errors";

export interface ExportDataModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ExportDataModal({ visible, onClose }: ExportDataModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();

  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { accounts } = useAccounts();

  const [scope, setScope] = useState<"all" | "year" | "month">("all");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [isExporting, setIsExporting] = useState(false);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [accounts]);

  const currentYear = useMemo(() => String(new Date().getFullYear()), []);
  const currentMonth = useMemo(() => currentMonthKey(), []);

  const filteredData = useMemo(() => {
    if (scope === "year") {
      return {
        expenses: expenses.filter((e) => e.date?.startsWith(currentYear)),
        incomes: incomes.filter((inc) => inc.date?.startsWith(currentYear)),
      };
    }
    if (scope === "month") {
      return {
        expenses: expenses.filter((e) => e.month === currentMonth || e.date?.startsWith(currentMonth)),
        incomes: incomes.filter((inc) => inc.date?.startsWith(currentMonth)),
      };
    }
    return { expenses, incomes };
  }, [expenses, incomes, scope, currentYear, currentMonth]);

  const handleExport = async () => {
    if (!system.allowDataExport) {
      Alert.alert(
        "Export Disabled",
        "Data export is currently disabled by system policy."
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
            currency: system.defaultCurrency,
            accountMap,
          }
        );
        title = `Expense_Tracker_Export_${scope}_${todayDateKey()}.csv`;
      } else {
        content = generateTransactionsJson(
          filteredData.expenses,
          filteredData.incomes,
          {
            currency: system.defaultCurrency,
            accountMap,
          }
        );
        title = `Expense_Tracker_Export_${scope}_${todayDateKey()}.json`;
      }

      await Share.share({
        message: content,
        title,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      onClose();
    } catch (err) {
      logWarning("exportDataModal.export", err);
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
              {/* Scope Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
                  EXPORT RANGE
                </Text>
                <View style={styles.chipRow}>
                  {(
                    [
                      { id: "all", label: `All History (${expenses.length + incomes.length})` },
                      { id: "year", label: `This Year (${currentYear})` },
                      { id: "month", label: `This Month (${currentMonth})` },
                    ] as const
                  ).map((s) => {
                    const isSelected = scope === s.id;
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          setScope(s.id);
                        }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: isSelected
                              ? theme.colors.primary
                              : isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.04)",
                            borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: isSelected ? "#FFFFFF" : theme.colors.foreground,
                              fontWeight: isSelected ? "700" : "500",
                            },
                          ]}
                        >
                          {s.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Format Selection */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
                  FORMAT
                </Text>
                <View style={styles.formatRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => undefined);
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
                      Haptics.selectionAsync().catch(() => undefined);
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
                disabled={isExporting}
                style={{ marginTop: 8 }}
              >
                <Download size={18} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontWeight: "800", color: "#FFFFFF" }}>
                  {isExporting ? "Generating..." : "Export & Share"}
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
