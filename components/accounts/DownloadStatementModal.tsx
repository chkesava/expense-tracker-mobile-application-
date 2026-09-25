import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FileSpreadsheet, FileText, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Amount } from "@/components/common/Amount";
import { Input } from "@/components/ui/Input";
import {
  accountAccent,
  accountAccentBorder,
} from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import {
  isValidStatementPeriod,
  resolveStatementPeriod,
  STATEMENT_PRESETS,
  type AccountStatement,
  type StatementPeriod,
  type StatementPreset,
} from "@/shared/utils/accountStatement";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { themeUsesDarkPalette } from "@/theme/tokens";

const PRESET_LABELS: Record<StatementPreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "this-year": "This year",
  custom: "Custom",
};

export interface DownloadStatementModalProps {
  visible: boolean;
  onClose: () => void;
  /** Today in the user's timezone — the day every preset resolves against. */
  today: string;
  currency: string;
  /** Builds the statement for a period. Pure; called on every change. */
  buildStatement: (period: StatementPeriod) => AccountStatement;
  onExport: (
    statement: AccountStatement,
    format: "pdf" | "csv"
  ) => Promise<void>;
  /** False when system policy has data export switched off. */
  exportAllowed: boolean;
  /**
   * Which format this sheet leads with (SPENDLY-91). The action center offers
   * "Download statement" and "Export CSV" as separate entries; both land on
   * this one period picker, and this is what makes them arrive somewhere
   * different once they do.
   */
  emphasis?: "pdf" | "csv";
}

/**
 * Download Statement (SPENDLY-79).
 *
 * The preview is the statement itself, not a separate calculation — the same
 * `buildStatement()` result that the PDF and CSV are rendered from — so what
 * the user reads here is exactly what lands in the file.
 */
export function DownloadStatementModal({
  visible,
  onClose,
  today,
  currency,
  buildStatement,
  onExport,
  exportAllowed,
  emphasis = "pdf",
}: DownloadStatementModalProps) {
  const { theme, themeName } = useTheme();
  const surfaces = useSurfaces();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();
  const accent = accountAccent(isDark);
  const accentBorder = accountAccentBorder(isDark);
  const surface = isDark ? "#10141C" : theme.colors.card;
  const inset = surfaces.tile;
  const insetBorder = isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.09)";

  const [preset, setPreset] = useState<StatementPreset>("this-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPreset("this-month");
    setBusy(null);
    // Seed the custom fields with this month, so switching to Custom starts
    // from a real range rather than two empty boxes.
    const thisMonth = resolveStatementPeriod("this-month", today);
    setCustomFrom(thisMonth.fromDate);
    setCustomTo(thisMonth.toDate);
  }, [today, visible]);

  const customValid =
    preset !== "custom" ||
    isValidStatementPeriod({ fromDate: customFrom, toDate: customTo });

  const period = useMemo(
    () =>
      resolveStatementPeriod(preset, today, {
        fromDate: customFrom,
        toDate: customTo,
      }),
    [customFrom, customTo, preset, today]
  );

  const statement = useMemo(
    () => (customValid ? buildStatement(period) : undefined),
    [buildStatement, customValid, period]
  );

  const canExport = exportAllowed && customValid && busy === null;

  const handleExport = async (format: "pdf" | "csv") => {
    if (!statement || !canExport) return;
    void haptic.selection();
    setBusy(format);
    try {
      await onExport(statement, format);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const summaryLine = (label: string, value: number | undefined) =>
    value === undefined ? null : (
      <View style={styles.summaryRow} key={label}>
        <Text style={[styles.summaryLabel, { color: theme.colors.mutedForeground }]}>
          {label}
        </Text>
        <Amount
          value={value}
          currency={currency}
          ghostable
          style={[styles.summaryValue, { color: theme.colors.foreground }]}
        />
      </View>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss download statement"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: surface,
              borderColor: theme.colors.border,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: insetBorder }]} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: theme.colors.foreground }]}>
                Download statement
              </Text>
              <Text
                style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
              >
                A bank-style statement of this account, as a PDF or a spreadsheet
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close download statement"
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: inset, borderColor: insetBorder },
                pressed ? styles.pressed : null,
              ]}
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <Text
                style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}
              >
                PERIOD
              </Text>
              <View style={styles.chipRow}>
                {STATEMENT_PRESETS.map((option) => {
                  const selected = option === preset;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        void haptic.selection();
                        setPreset(option);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={PRESET_LABELS[option]}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: selected
                            ? isDark
                              ? "rgba(74,222,128,0.16)"
                              : "rgba(22,163,74,0.12)"
                            : inset,
                          borderColor: selected ? accentBorder : insetBorder,
                        },
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: selected ? accent : theme.colors.foreground,
                            fontWeight: selected ? "700" : "500",
                          },
                        ]}
                      >
                        {PRESET_LABELS[option]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {preset === "custom" ? (
              <View style={styles.section}>
                <View style={styles.inputRow}>
                  <View style={styles.inputColumn}>
                    <Text
                      style={[
                        styles.inputLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      From
                    </Text>
                    <Input
                      value={customFrom}
                      onChangeText={setCustomFrom}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.inputColumn}>
                    <Text
                      style={[
                        styles.inputLabel,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      To
                    </Text>
                    <Input
                      value={customTo}
                      onChangeText={setCustomTo}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                {customValid ? null : (
                  <Text style={[styles.error, { color: theme.colors.destructive }]}>
                    Enter both dates as YYYY-MM-DD, with From on or before To.
                  </Text>
                )}
              </View>
            ) : null}

            {statement ? (
              <View
                style={[
                  styles.preview,
                  { backgroundColor: inset, borderColor: insetBorder },
                ]}
              >
                <Text style={[styles.previewPeriod, { color: theme.colors.foreground }]}>
                  {statement.period.label}
                </Text>
                {summaryLine("Opening balance", statement.openingBalance)}
                {summaryLine("Money in", statement.moneyIn)}
                {summaryLine("Money out", statement.moneyOut)}
                {summaryLine("Closing balance", statement.closingBalance)}
                <Text
                  style={[styles.previewCount, { color: theme.colors.mutedForeground }]}
                >
                  {statement.transactionCount}{" "}
                  {statement.transactionCount === 1 ? "transaction" : "transactions"}
                </Text>
                {statement.notes.map((note) => (
                  <Text
                    key={note}
                    style={[styles.note, { color: theme.colors.mutedForeground }]}
                  >
                    {note}
                  </Text>
                ))}
              </View>
            ) : null}

            {exportAllowed ? null : (
              <Text style={[styles.error, { color: theme.colors.destructive }]}>
                Data export is currently disabled by system policy.
              </Text>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: insetBorder }]}>
            <Pressable
              onPress={() => void handleExport("csv")}
              disabled={!canExport}
              accessibilityRole="button"
              accessibilityLabel="Download statement as CSV"
              accessibilityState={{ disabled: !canExport }}
              style={({ pressed }) => [
                styles.footerButton,
                {
                  backgroundColor:
                    emphasis === "csv"
                      ? isDark
                        ? "rgba(74,222,128,0.16)"
                        : "rgba(22,163,74,0.12)"
                      : inset,
                  borderColor: emphasis === "csv" ? accentBorder : insetBorder,
                  opacity: canExport ? 1 : 0.5,
                },
                pressed ? styles.pressed : null,
              ]}
            >
              {busy === "csv" ? (
                <ActivityIndicator
                  size="small"
                  color={emphasis === "csv" ? accent : theme.colors.foreground}
                />
              ) : (
                <FileSpreadsheet
                  size={17}
                  color={emphasis === "csv" ? accent : theme.colors.foreground}
                />
              )}
              <Text
                style={[
                  styles.footerText,
                  {
                    color:
                      emphasis === "csv" ? accent : theme.colors.foreground,
                  },
                ]}
              >
                CSV
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleExport("pdf")}
              disabled={!canExport}
              accessibilityRole="button"
              accessibilityLabel="Download statement as PDF"
              accessibilityState={{ disabled: !canExport }}
              style={({ pressed }) => [
                styles.footerButton,
                {
                  backgroundColor:
                    emphasis === "pdf"
                      ? isDark
                        ? "rgba(74,222,128,0.16)"
                        : "rgba(22,163,74,0.12)"
                      : inset,
                  borderColor: emphasis === "pdf" ? accentBorder : insetBorder,
                  opacity: canExport ? 1 : 0.5,
                },
                pressed ? styles.pressed : null,
              ]}
            >
              {busy === "pdf" ? (
                <ActivityIndicator
                  size="small"
                  color={emphasis === "pdf" ? accent : theme.colors.foreground}
                />
              ) : (
                <FileText
                  size={17}
                  color={emphasis === "pdf" ? accent : theme.colors.foreground}
                />
              )}
              <Text
                style={[
                  styles.footerText,
                  { color: emphasis === "pdf" ? accent : theme.colors.foreground },
                ]}
              >
                PDF
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingTop: 10,
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    gap: 18,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputColumn: {
    flex: 1,
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  error: {
    fontSize: 12,
    fontWeight: "600",
  },
  preview: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  previewPeriod: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  previewCount: {
    fontSize: 11,
    marginTop: 2,
  },
  note: {
    fontSize: 11,
    lineHeight: 15,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  footerText: {
    fontSize: 14,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.75,
  },
});
