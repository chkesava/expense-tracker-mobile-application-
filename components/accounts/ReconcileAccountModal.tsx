import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, FileUp, TriangleAlert, X } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  accountAccent,
  accountAccentBorder,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import {
  isValidStatementPeriod,
  resolveStatementPeriod,
  STATEMENT_PRESETS,
  type AccountStatement,
  type StatementPeriod,
  type StatementPreset,
} from "@/shared/utils/accountStatement";
import {
  proposedAdjustment,
  reconcileAccountStatement,
  type AccountReconciliationResult,
} from "@/shared/utils/accountReconciliation";
import { parseStatementLines, type StatementLine } from "@/shared/utils/statementParse";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { FilterableAccountActivity } from "@/shared/utils/accountActivityFilters";

const PRESET_LABELS: Record<StatementPreset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "this-year": "This year",
  custom: "Custom",
};

const UNREADABLE_COPY =
  "That file isn't readable as text. Export a CSV from the bank, or paste the statement lines below.";

function isBinaryAsset(name: string, mimeType?: string | null, contents?: string) {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/") || mime.includes("pdf")) return true;
  if (/\.(png|jpe?g|webp|heic|heif|gif|pdf)$/i.test(name)) return true;
  return Boolean(contents && contents.trimStart().startsWith("%PDF"));
}

export interface ReconcileAccountModalProps {
  visible: boolean;
  onClose: () => void;
  today: string;
  currency: string;
  /** The account's full activity, newest first. */
  records: FilterableAccountActivity[];
  /** Spendly's own statement for a period — the source of the ledger balance. */
  buildStatement: (period: StatementPeriod) => AccountStatement;
  onSave: (
    result: AccountReconciliationResult,
    note: string
  ) => Promise<boolean>;
  /** Records the explicit adjustment entry. Returns true when it was written. */
  onRecordAdjustment: (
    direction: "credit" | "debit",
    amount: number,
    date: string,
    note: string
  ) => Promise<boolean>;
}

/**
 * Reconcile Account (SPENDLY-87).
 *
 * Reconciling is reading, not writing. This sheet reports what agrees with the
 * bank and what does not; it never edits the ledger to make the numbers meet.
 * Closing a variance is a separate, deliberate act — an ordinary account entry
 * with the user's own reason on it — offered here but never performed
 * automatically.
 */
export function ReconcileAccountModal({
  visible,
  onClose,
  today,
  currency,
  records,
  buildStatement,
  onSave,
  onRecordAdjustment,
}: ReconcileAccountModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const insets = useSafeAreaInsets();
  const accent = accountAccent(isDark);
  const accentBorder = accountAccentBorder(isDark);
  const surface = isDark ? "#10141C" : theme.colors.card;
  const inset = isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)";
  const insetBorder = isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.09)";

  const [preset, setPreset] = useState<StatementPreset>("last-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [closingInput, setClosingInput] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPreset("last-month");
    setClosingInput("");
    setPastedText("");
    setLines([]);
    setNote("");
    setSaving(false);
    setAdjusting(false);
    const lastMonth = resolveStatementPeriod("last-month", today);
    setCustomFrom(lastMonth.fromDate);
    setCustomTo(lastMonth.toDate);
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

  const statementClosingBalance = useMemo(() => {
    const trimmed = closingInput.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [closingInput]);

  const result = useMemo(
    () =>
      statement
        ? reconcileAccountStatement(records, lines, period, {
            ledgerClosingBalance: statement.closingBalance,
            statementClosingBalance,
          })
        : undefined,
    [lines, period, records, statement, statementClosingBalance]
  );

  const applyParsedText = useCallback((text: string) => {
    const parsed = parseStatementLines(text);
    setLines(parsed.lines);
    if (parsed.lines.length === 0) {
      toast.info("No transactions were recognised in that statement.");
    } else {
      toast.success(
        `Read ${parsed.lines.length} ${
          parsed.lines.length === 1 ? "line" : "lines"
        } from the statement.`
      );
    }
  }, []);

  const pickFile = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/plain",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const contents = new File(asset.uri).textSync();
      if (isBinaryAsset(asset.name, asset.mimeType, contents)) {
        toast.info(UNREADABLE_COPY);
        return;
      }
      setPastedText(contents);
      applyParsedText(contents);
    } catch (error) {
      logError("reconcileAccount.pickFile", error);
      toast.error(friendlyErrorMessage(error, "Couldn't read that file."));
    }
  }, [applyParsedText]);

  const adjustment = result ? proposedAdjustment(result) : undefined;
  const canSave =
    Boolean(result) &&
    result?.variance !== undefined &&
    customValid &&
    !saving;

  const handleSave = async () => {
    if (!result || !canSave) return;
    void haptic.selection();
    setSaving(true);
    try {
      const saved = await onSave(result, note);
      if (saved) onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustment || !result) return;
    void haptic.selection();
    setAdjusting(true);
    try {
      await onRecordAdjustment(
        adjustment.direction,
        adjustment.amount,
        result.period.toDate,
        note.trim() ||
          `Reconciliation adjustment for ${result.period.label}`
      );
    } finally {
      setAdjusting(false);
    }
  };

  const balanceRow = (label: string, value: number | undefined, color?: string) => (
    <View style={styles.balanceRow}>
      <Text style={[styles.balanceLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      {value === undefined ? (
        <Text style={[styles.balanceValue, { color: theme.colors.mutedForeground }]}>
          —
        </Text>
      ) : (
        <Amount
          value={value}
          currency={currency}
          ghostable
          style={[styles.balanceValue, color ? { color } : { color: theme.colors.foreground }]}
        />
      )}
    </View>
  );

  const listSection = (
    title: string,
    caption: string,
    rows: Array<{ key: string; date: string; label: string; amount: number }>
  ) => {
    if (rows.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
          {title} ({rows.length})
        </Text>
        <Text style={[styles.sectionCaption, { color: theme.colors.mutedForeground }]}>
          {caption}
        </Text>
        {rows.slice(0, 20).map((row) => (
          <View key={row.key} style={styles.lineRow}>
            <View style={styles.lineCopy}>
              <Text
                numberOfLines={1}
                style={[styles.lineLabel, { color: theme.colors.foreground }]}
              >
                {row.label}
              </Text>
              <Text style={[styles.lineDate, { color: theme.colors.mutedForeground }]}>
                {row.date}
              </Text>
            </View>
            <Amount
              value={row.amount}
              currency={currency}
              ghostable
              style={[styles.lineAmount, { color: theme.colors.foreground }]}
            />
          </View>
        ))}
        {rows.length > 20 ? (
          <Text style={[styles.sectionCaption, { color: theme.colors.mutedForeground }]}>
            and {rows.length - 20} more
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={styles.backdropFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss reconcile account"
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
                  Reconcile account
                </Text>
                <Text
                  style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
                >
                  Check Spendly against your real bank statement
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close reconcile account"
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
                {preset === "custom" ? (
                  <View style={styles.inputRow}>
                    <View style={styles.inputColumn}>
                      <Text
                        style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}
                      >
                        From
                      </Text>
                      <TextInput
                        value={customFrom}
                        onChangeText={setCustomFrom}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={theme.colors.mutedForeground}
                        autoCapitalize="none"
                        style={[
                          styles.input,
                          {
                            color: theme.colors.foreground,
                            backgroundColor: inset,
                            borderColor: insetBorder,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.inputColumn}>
                      <Text
                        style={[styles.inputLabel, { color: theme.colors.mutedForeground }]}
                      >
                        To
                      </Text>
                      <TextInput
                        value={customTo}
                        onChangeText={setCustomTo}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={theme.colors.mutedForeground}
                        autoCapitalize="none"
                        style={[
                          styles.input,
                          {
                            color: theme.colors.foreground,
                            backgroundColor: inset,
                            borderColor: insetBorder,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}
                {customValid ? null : (
                  <Text style={[styles.error, { color: theme.colors.destructive }]}>
                    Enter both dates as YYYY-MM-DD, with From on or before To.
                  </Text>
                )}
              </View>

              <View
                style={[
                  styles.panel,
                  { backgroundColor: inset, borderColor: insetBorder },
                ]}
              >
                <Text style={[styles.panelTitle, { color: theme.colors.foreground }]}>
                  {period.label}
                </Text>
                {balanceRow("Spendly opening balance", statement?.openingBalance)}
                {balanceRow("Spendly closing balance", statement?.closingBalance)}
                {statement && statement.closingBalance === undefined ? (
                  <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
                    {statement.notes[0] ??
                      "Spendly has no closing balance for this period, so there is nothing to compare."}
                  </Text>
                ) : null}
              </View>

              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}
                >
                  STATEMENT CLOSING BALANCE
                </Text>
                <TextInput
                  value={closingInput}
                  onChangeText={setClosingInput}
                  placeholder="As printed on your bank statement"
                  placeholderTextColor={theme.colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  style={[
                    styles.input,
                    {
                      color: theme.colors.foreground,
                      backgroundColor: inset,
                      borderColor: insetBorder,
                    },
                  ]}
                />
              </View>

              {result && result.variance !== undefined ? (
                <View
                  style={[
                    styles.panel,
                    {
                      backgroundColor:
                        result.status === "balanced"
                          ? isDark
                            ? "rgba(74,222,128,0.12)"
                            : "rgba(22,163,74,0.08)"
                          : isDark
                            ? "rgba(248,113,113,0.12)"
                            : "rgba(239,68,68,0.08)",
                      borderColor:
                        result.status === "balanced" ? accentBorder : ACCOUNT_RED,
                    },
                  ]}
                >
                  <View style={styles.varianceHead}>
                    {result.status === "balanced" ? (
                      <Check size={16} color={accent} />
                    ) : (
                      <TriangleAlert size={16} color={ACCOUNT_RED} />
                    )}
                    <Text
                      style={[
                        styles.panelTitle,
                        {
                          color:
                            result.status === "balanced" ? accent : ACCOUNT_RED,
                        },
                      ]}
                    >
                      {result.status === "balanced"
                        ? "Balanced"
                        : "Variance found"}
                    </Text>
                  </View>
                  {balanceRow(
                    "Variance (statement − Spendly)",
                    result.variance,
                    result.status === "balanced" ? accent : ACCOUNT_RED
                  )}
                  {result.status === "balanced" ? (
                    <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
                      Spendly agrees with your bank for this period.
                    </Text>
                  ) : (
                    <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
                      Nothing has been changed. Recording an adjustment adds an
                      ordinary account entry you can see and undo.
                    </Text>
                  )}
                </View>
              ) : null}

              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}
                >
                  STATEMENT TRANSACTIONS (OPTIONAL)
                </Text>
                <Text style={[styles.sectionCaption, { color: theme.colors.mutedForeground }]}>
                  Import a CSV or paste the lines to see which transactions match.
                  Read on this device only — nothing is uploaded.
                </Text>
                <Pressable
                  onPress={() => void pickFile()}
                  accessibilityRole="button"
                  accessibilityLabel="Import a statement file"
                  style={({ pressed }) => [
                    styles.importButton,
                    { backgroundColor: inset, borderColor: insetBorder },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <FileUp size={16} color={theme.colors.foreground} />
                  <Text style={[styles.importLabel, { color: theme.colors.foreground }]}>
                    Import CSV
                  </Text>
                </Pressable>
                <TextInput
                  value={pastedText}
                  onChangeText={setPastedText}
                  onBlur={() => {
                    if (pastedText.trim()) applyParsedText(pastedText);
                  }}
                  placeholder="…or paste statement lines here"
                  placeholderTextColor={theme.colors.mutedForeground}
                  multiline
                  autoCapitalize="none"
                  style={[
                    styles.textArea,
                    {
                      color: theme.colors.foreground,
                      backgroundColor: inset,
                      borderColor: insetBorder,
                    },
                  ]}
                />
              </View>

              {result && lines.length > 0 ? (
                <>
                  <Text style={[styles.matchSummary, { color: theme.colors.foreground }]}>
                    {result.matched.length} matched · {result.missingInApp.length} missing
                    from Spendly · {result.extraInApp.length} not on the statement
                  </Text>
                  {listSection(
                    "On the statement, not in Spendly",
                    "Transactions your bank charged that Spendly has no record of.",
                    result.missingInApp.map((entry) => ({
                      key: entry.id,
                      date: entry.date,
                      label: entry.merchant,
                      amount: entry.amount,
                    }))
                  )}
                  {listSection(
                    "In Spendly, not on the statement",
                    "Transactions recorded here that the bank has not posted.",
                    result.extraInApp.map((entry) => ({
                      key: entry.activityId,
                      date: entry.date,
                      label: `${entry.description} · ${entry.subtype}`,
                      amount: entry.amount,
                    }))
                  )}
                  {result.outOfPeriod.length > 0 ? (
                    <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
                      {result.outOfPeriod.length} statement{" "}
                      {result.outOfPeriod.length === 1 ? "line falls" : "lines fall"}{" "}
                      outside this period and {result.outOfPeriod.length === 1 ? "was" : "were"}{" "}
                      not compared.
                    </Text>
                  ) : null}
                </>
              ) : null}

              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}
                >
                  NOTE
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Why this reconciliation, or what the variance was"
                  placeholderTextColor={theme.colors.mutedForeground}
                  style={[
                    styles.input,
                    {
                      color: theme.colors.foreground,
                      backgroundColor: inset,
                      borderColor: insetBorder,
                    },
                  ]}
                />
              </View>

              {adjustment ? (
                <Pressable
                  onPress={() => void handleAdjust()}
                  disabled={adjusting}
                  accessibilityRole="button"
                  accessibilityLabel="Record an adjustment entry"
                  style={({ pressed }) => [
                    styles.adjustButton,
                    {
                      backgroundColor: inset,
                      borderColor: insetBorder,
                      opacity: adjusting ? 0.6 : 1,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {adjusting ? (
                    <ActivityIndicator size="small" color={theme.colors.foreground} />
                  ) : null}
                  <Text
                    style={[styles.importLabel, { color: theme.colors.foreground }]}
                  >
                    Record a {adjustment.direction} adjustment entry
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: insetBorder }]}>
              <Pressable
                onPress={() => void handleSave()}
                disabled={!canSave}
                accessibilityRole="button"
                accessibilityLabel="Save reconciliation"
                accessibilityState={{ disabled: !canSave }}
                style={({ pressed }) => [
                  styles.footerButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(74,222,128,0.16)"
                      : "rgba(22,163,74,0.12)",
                    borderColor: accentBorder,
                    opacity: canSave ? 1 : 0.5,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                {saving ? <ActivityIndicator size="small" color={accent} /> : null}
                <Text style={[styles.footerText, { color: accent }]}>
                  Save reconciliation
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  backdropFill: { flex: 1 },
  sheet: {
    maxHeight: "92%",
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
  headerCopy: { flex: 1, gap: 2 },
  title: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontWeight: "500" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 18, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  sectionCaption: { fontSize: 11, lineHeight: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13 },
  inputRow: { flexDirection: "row", gap: 12 },
  inputColumn: { flex: 1, gap: 6 },
  inputLabel: { fontSize: 11, fontWeight: "600" },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 88,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 13,
    textAlignVertical: "top",
  },
  error: { fontSize: 12, fontWeight: "600" },
  panel: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  panelTitle: { fontSize: 13, fontWeight: "700" },
  varianceHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  balanceLabel: { fontSize: 12, flexShrink: 1 },
  balanceValue: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  note: { fontSize: 11, lineHeight: 15 },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  importLabel: { fontSize: 13, fontWeight: "700" },
  adjustButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  matchSummary: { fontSize: 12, fontWeight: "600" },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  lineCopy: { flex: 1, gap: 1 },
  lineLabel: { fontSize: 13, fontWeight: "600" },
  lineDate: { fontSize: 11 },
  lineAmount: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
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
  footerText: { fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.75 },
});
