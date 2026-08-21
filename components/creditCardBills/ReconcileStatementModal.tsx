import { memo, useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { TransactionInboxItem } from "@/components/sms/TransactionInboxItem";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { useAuth } from "@/providers/AuthProvider";
import { createExpense } from "@/services/ledger/createLedgerTransaction";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { roundMoney } from "@/shared/utils/accountBalance";
import {
  matchStatementLines,
  sumCardSpendInRange,
} from "@/shared/utils/statementMatch";
import {
  parseStatementLines,
  statementDateWindow,
  sumStatementDebits,
  type StatementLine,
} from "@/shared/utils/statementParse";
import {
  categoryFromStatementLine,
  expenseDraftFromStatementLine,
} from "@/shared/utils/statementReview";
import { useTheme } from "@/theme/ThemeProvider";

type ReviewRow =
  | { type: "section"; id: string; title: string }
  | {
      type: "missing";
      id: string;
      amount: number;
      merchant: string;
      categoryLabel: string;
    }
  | {
      type: "matched";
      id: string;
      amount: number;
      merchant: string;
      date: string;
    }
  | {
      type: "credit";
      id: string;
      amount: number;
      merchant: string;
      date: string;
      logged: boolean;
    }
  | {
      type: "extra";
      id: string;
      amount: number;
      note: string;
      date: string;
    }
  | { type: "empty"; id: string; message: string };

const UNREADABLE_IMAGE_COPY =
  "Photos aren't read on this device. Export a CSV from the bank or paste the statement text.";
const UNREADABLE_PDF_COPY =
  "This PDF isn't readable as text. Export a CSV from the bank, or paste the statement lines.";

function isImageAsset(name: string, mimeType?: string | null): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|heic|heif|gif)$/i.test(name);
}

function isPdfAsset(name: string, mimeType?: string | null, contents?: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("pdf") || /\.pdf$/i.test(name)) return true;
  return Boolean(contents && contents.trimStart().startsWith("%PDF"));
}

const ReadOnlyLine = memo(function ReadOnlyLine({
  amount,
  title,
  subtitle,
  currency,
}: {
  amount: number;
  title: string;
  subtitle: string;
  currency: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.readOnly,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.readOnlyBody}>
        <Text
          style={[styles.readOnlyTitle, { color: theme.colors.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.readOnlySub, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <Amount
        value={amount}
        currency={currency}
        ghostable
        style={[styles.readOnlyAmount, { color: theme.colors.foreground }]}
      />
    </View>
  );
});

export function ReconcileStatementModal({
  visible,
  onClose,
  accountId,
  accountName,
  currency,
  openBill,
  usedThisCycle,
}: {
  visible: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  currency: string;
  openBill: CreditCardBill | null;
  usedThisCycle: number;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { expenses } = useExpenses();
  const { payments } = useAccountPayments();
  const { updateBill } = useCreditCardBills();

  const [pasteText, setPasteText] = useState("");
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [statementTotal, setStatementTotal] = useState<number | undefined>(undefined);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updatingBill, setUpdatingBill] = useState(false);

  const reset = useCallback(() => {
    setPasteText("");
    setLines([]);
    setStatementTotal(undefined);
    setSkippedIds(new Set());
    setAddedIds(new Set());
    setBusyId(null);
    setUpdatingBill(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const applyParsedText = useCallback((text: string) => {
    const parsed = parseStatementLines(text);
    if (parsed.lines.length === 0) {
      toast.error(
        "No transactions found. Use a CSV with Date, Description, and Amount, or paste dated lines."
      );
      return;
    }
    setLines(parsed.lines);
    setStatementTotal(parsed.statementTotal);
    setSkippedIds(new Set());
    setAddedIds(new Set());
  }, []);

  const pickCsv = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/plain",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
          "application/pdf",
          "image/*",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (isImageAsset(asset.name, asset.mimeType)) {
        toast.info(UNREADABLE_IMAGE_COPY);
        return;
      }
      const contents = new File(asset.uri).textSync();
      if (isPdfAsset(asset.name, asset.mimeType, contents) && contents.trimStart().startsWith("%PDF")) {
        toast.info(UNREADABLE_PDF_COPY);
        return;
      }
      applyParsedText(contents);
    } catch (error) {
      logError("reconcileStatement.pickCsv", error);
      toast.error(friendlyErrorMessage(error, "Couldn't read that file."));
    }
  }, [applyParsedText]);

  const pickPhotos = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "Photo library access is needed to pick statement screenshots."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
      });
      if (result.canceled) return;
      toast.info(UNREADABLE_IMAGE_COPY);
    } catch (error) {
      logError("reconcileStatement.pickPhotos", error);
      toast.error(friendlyErrorMessage(error, "Couldn't open your photo library."));
    }
  }, []);

  const match = useMemo(
    () => matchStatementLines(lines, expenses, payments, accountId),
    [accountId, expenses, lines, payments]
  );

  const hiddenIds = useMemo(() => {
    const ids = new Set(skippedIds);
    addedIds.forEach((id) => ids.add(id));
    return ids;
  }, [addedIds, skippedIds]);

  const visibleMissing = useMemo(
    () => match.missingInApp.filter((line) => !hiddenIds.has(line.id)),
    [hiddenIds, match.missingInApp]
  );

  const window = useMemo(() => {
    if (openBill?.billingPeriodStart && openBill.billingPeriodEnd) {
      return { start: openBill.billingPeriodStart, end: openBill.billingPeriodEnd };
    }
    return statementDateWindow(lines);
  }, [lines, openBill]);

  const appCycleTotal = useMemo(() => {
    if (!window) return usedThisCycle;
    return sumCardSpendInRange(accountId, expenses, window.start, window.end);
  }, [accountId, expenses, usedThisCycle, window]);

  const parsedStatementTotal = statementTotal ?? (lines.length > 0 ? sumStatementDebits(lines) : undefined);
  const gap =
    parsedStatementTotal == null
      ? undefined
      : roundMoney(parsedStatementTotal - appCycleTotal);

  const rows = useMemo((): ReviewRow[] => {
    if (lines.length === 0) return [];
    const next: ReviewRow[] = [
      { type: "section", id: "sec-missing", title: "Missing in app" },
    ];
    if (visibleMissing.length === 0) {
      next.push({
        type: "empty",
        id: "empty-missing",
        message: "Nothing to add from this statement.",
      });
    } else {
      for (const line of visibleMissing) {
        const { category, subcategory } = categoryFromStatementLine(line);
        next.push({
          type: "missing",
          id: line.id,
          amount: line.amount,
          merchant: line.merchant,
          categoryLabel: `${category} · ${subcategory} · ${line.date}`,
        });
      }
    }

    const matchedDebits = match.matched.filter((row) => row.line.kind === "debit");
    next.push({ type: "section", id: "sec-matched", title: "Already in the app" });
    if (matchedDebits.length === 0) {
      next.push({
        type: "empty",
        id: "empty-matched",
        message: "No matching card purchases yet.",
      });
    } else {
      for (const row of matchedDebits) {
        next.push({
          type: "matched",
          id: `matched-${row.line.id}`,
          amount: row.line.amount,
          merchant: row.line.merchant,
          date: row.line.date,
        });
      }
    }

    const matchedCredits = match.matched.filter((row) => row.line.kind === "credit");
    if (matchedCredits.length > 0 || match.unloggedCredits.length > 0) {
      next.push({ type: "section", id: "sec-credits", title: "Payments on the statement" });
      for (const row of matchedCredits) {
        next.push({
          type: "credit",
          id: `credit-${row.line.id}`,
          amount: row.line.amount,
          merchant: row.line.merchant,
          date: row.line.date,
          logged: true,
        });
      }
      for (const line of match.unloggedCredits) {
        next.push({
          type: "credit",
          id: `unlogged-${line.id}`,
          amount: line.amount,
          merchant: line.merchant,
          date: line.date,
          logged: false,
        });
      }
    }

    if (match.extraInApp.length > 0) {
      next.push({
        type: "section",
        id: "sec-extra",
        title: "In the app, not on this statement",
      });
      for (const row of match.extraInApp) {
        next.push({
          type: "extra",
          id: `extra-${row.id}`,
          amount: row.amount,
          note: row.note || (row.kind === "payment" ? "Payment" : "Expense"),
          date: row.date,
        });
      }
    }

    return next;
  }, [lines.length, match, visibleMissing]);

  const onAdd = useCallback(
    async (id: string) => {
      const uid = user?.uid ?? "";
      if (!uid) {
        toast.error("Sign in to add this expense.");
        return;
      }
      const line = lines.find((item) => item.id === id);
      if (!line || line.kind !== "debit") return;
      setBusyId(id);
      try {
        const { outcome } = await createExpense(
          uid,
          expenseDraftFromStatementLine(line, accountId)
        );
        setAddedIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        toast.success(writeSavedMessage(outcome, "Expense added"));
      } catch (error) {
        logError("reconcileStatement.add", error);
        toast.error(friendlyErrorMessage(error, "Couldn't add that expense."));
      } finally {
        setBusyId(null);
      }
    },
    [accountId, lines, user?.uid]
  );

  const handleAdd = useCallback(
    (id: string) => {
      void onAdd(id);
    },
    [onAdd]
  );

  const onSkip = useCallback((id: string) => {
    setSkippedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const confirmUpdateBill = useCallback(() => {
    if (!openBill) return;
    Alert.alert(
      "Update statement amount?",
      `Replace the open bill with the app total ${formatAmount(appCycleTotal, currency)}? This does not add expenses.`,
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Update bill",
          onPress: () => {
            void (async () => {
              setUpdatingBill(true);
              try {
                const ok = await updateBill(openBill.id, {
                  statementAmount: appCycleTotal,
                });
                if (ok) toast.success("Statement amount updated");
                else toast.error("Couldn't update the statement bill.");
              } catch (error) {
                logError("reconcileStatement.updateBill", error);
                toast.error(
                  friendlyErrorMessage(error, "Couldn't update the statement bill.")
                );
              } finally {
                setUpdatingBill(false);
              }
            })();
          },
        },
      ]
    );
  }, [appCycleTotal, currency, openBill, updateBill]);

  const renderItem = useCallback(
    ({ item }: { item: ReviewRow }) => {
      if (item.type === "section") {
        return (
          <Text style={[styles.section, { color: theme.colors.mutedForeground }]}>
            {item.title}
          </Text>
        );
      }
      if (item.type === "empty") {
        return (
          <Text style={[styles.empty, { color: theme.colors.mutedForeground }]}>
            {item.message}
          </Text>
        );
      }
      if (item.type === "missing") {
        return (
          <TransactionInboxItem
            id={item.id}
            amount={item.amount}
            merchant={item.merchant}
            categoryLabel={item.categoryLabel}
            busy={busyId === item.id}
            onAdd={handleAdd}
            onIgnore={onSkip}
            ignoreLabel="Skip"
          />
        );
      }
      if (item.type === "matched") {
        return (
          <ReadOnlyLine
            amount={item.amount}
            title={item.merchant}
            subtitle={`${item.date} · matched`}
            currency={currency}
          />
        );
      }
      if (item.type === "credit") {
        return (
          <ReadOnlyLine
            amount={item.amount}
            title={item.merchant}
            subtitle={
              item.logged
                ? `${item.date} · payment logged`
                : `${item.date} · not logged as a payment`
            }
            currency={currency}
          />
        );
      }
      return (
        <ReadOnlyLine
          amount={item.amount}
          title={item.note}
          subtitle={`${item.date} · extra in app`}
          currency={currency}
        />
      );
    },
    [busyId, currency, handleAdd, onSkip, theme.colors.mutedForeground]
  );

  const keyExtractor = useCallback((item: ReviewRow) => item.id, []);
  const getItemType = useCallback((item: ReviewRow) => item.type, []);

  const listHeader = (
    <View style={styles.headerBlock}>
      <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
        Parse on this device. Add only the missing card purchases you accept.
        Closing discards the list.
      </Text>

      {lines.length === 0 ? (
        <>
          <View style={styles.pickerRow}>
            <View style={styles.pickerSlot}>
              <Button
                size="sm"
                variant="outline"
                onPress={() => void pickCsv()}
                style={styles.pickerButton}
              >
                CSV
              </Button>
            </View>
            <View style={styles.pickerSlot}>
              <Button
                size="sm"
                variant="outline"
                onPress={() => void pickPhotos()}
                style={styles.pickerButton}
              >
                Photos
              </Button>
            </View>
          </View>

          <Input
            label="Paste statement text"
            value={pasteText}
            onChangeText={setPasteText}
            placeholder="13/08/2026  SWIGGY  450.00"
            multiline
            textAlignVertical="top"
            style={styles.pasteInput}
            helperText="CSV export is most reliable. Photos and bank PDFs usually need a CSV or paste."
          />
          <Button
            size="sm"
            variant="secondary"
            onPress={() => applyParsedText(pasteText)}
            disabled={pasteText.trim().length === 0}
          >
            Parse pasted text
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onPress={() => {
            setLines([]);
            setStatementTotal(undefined);
            setSkippedIds(new Set());
            setAddedIds(new Set());
          }}
        >
          Replace statement
        </Button>
      )}

      {parsedStatementTotal != null ? (
        <View
          style={[
            styles.totals,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground }]}>
              Statement
            </Text>
            <Amount
              value={parsedStatementTotal}
              currency={currency}
              ghostable
              style={[styles.totalValue, { color: theme.colors.foreground }]}
            />
          </View>
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground }]}>
              In app
            </Text>
            <Amount
              value={appCycleTotal}
              currency={currency}
              ghostable
              style={[styles.totalValue, { color: theme.colors.foreground }]}
            />
          </View>
          {gap != null ? (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground }]}>
                Gap
              </Text>
              <Amount
                value={gap}
                currency={currency}
                ghostable
                style={[styles.totalValue, { color: theme.colors.foreground }]}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const showUpdateBill =
    addedIds.size > 0 &&
    openBill != null &&
    roundMoney(openBill.statementAmount) !== roundMoney(appCycleTotal);

  const listFooter =
    showUpdateBill ? (
      <View style={styles.footer}>
        <Button loading={updatingBill} onPress={confirmUpdateBill}>
          Update statement bill
        </Button>
      </View>
    ) : (
      <View style={styles.footerSpacer} />
    );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.background,
            paddingTop: Platform.OS === "ios" ? 16 : insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text
              style={[styles.title, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              Reconcile statement
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {accountName}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              void haptic.selection();
              close();
            }}
            style={[styles.closeBtn, { backgroundColor: theme.colors.muted }]}
            accessibilityRole="button"
            accessibilityLabel="Close statement review"
          >
            <X size={18} color={theme.colors.foreground} />
          </Pressable>
        </View>

        {listHeader}

        <FlashList
          style={styles.list}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          ListFooterComponent={listFooter}
          extraData={`${busyId ?? ""}-${addedIds.size}-${skippedIds.size}`}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.listContent}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerBlock: {
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  lede: {
    fontSize: 13,
    lineHeight: 18,
  },
  pickerRow: {
    flexDirection: "row",
    gap: 10,
  },
  pickerSlot: {
    flex: 1,
  },
  pickerButton: {
    width: "100%",
  },
  pasteInput: {
    minHeight: 96,
  },
  totals: {
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 14,
    gap: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  totalLabel: {
    fontSize: 13,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  section: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  empty: {
    fontSize: 13,
    marginBottom: 8,
  },
  readOnly: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 14,
    marginBottom: 8,
  },
  readOnlyBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  readOnlyTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  readOnlySub: {
    fontSize: 12,
    fontWeight: "600",
  },
  readOnlyAmount: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  footerSpacer: {
    height: 8,
  },
});
