import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  PieChart,
  Repeat,
  Share2,
  Target,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { useCategoryBudgets } from "@/hooks/useCategoryBudgets";
import {
  transactionActions,
  type TransactionActionContext,
  type TransactionActionId,
} from "@/shared/utils/transactionActions";
import { useTheme } from "@/theme/ThemeProvider";

type ActionCopy = { icon: LucideIcon; title: string; detail: string; destructive?: boolean };

/**
 * SPENDLY-577 — the transaction detail's "More options" sheet. Mounted only
 * while open, so its budget lookup (the shared, ref-counted reference-data
 * subscription) never runs for a detail nobody opened the sheet on. The rows
 * come from `transactionActions`; each handler is an existing flow.
 */
export function TransactionMoreSheet({
  onClose,
  context,
  month,
  accountName,
  onAction,
}: {
  onClose: () => void;
  context: Omit<TransactionActionContext, "hasBudget">;
  /** The row's month, for the budget lookup. */
  month: string;
  accountName?: string | null;
  onAction: (action: TransactionActionId) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { budgets } = useCategoryBudgets({ enabled: context.kind === "expense" && Boolean(context.category) });
  const hasBudget = useMemo(
    () => (budgets ?? []).some((b) => b.category === context.category && b.month === month),
    [budgets, context.category, month]
  );
  const actions = transactionActions({ ...context, hasBudget });

  const copy: Record<TransactionActionId, ActionCopy> = {
    viewAccount: { icon: Wallet, title: "View account", detail: accountName ? `Open ${accountName}` : "Open the account" },
    viewCategory: { icon: PieChart, title: "View category", detail: `${context.category ?? "Category"} spending this month` },
    viewBudget: { icon: Target, title: "View budget", detail: `${context.category ?? "This category"}'s budget this month` },
    setBudget: { icon: Target, title: "Set a budget", detail: `No budget for ${context.category ?? "this category"} this month` },
    createRecurring: {
      icon: Repeat,
      title: "Make it recurring",
      detail: "Repeat monthly from next month — this payment isn't posted again",
    },
    share: { icon: Share2, title: "Share details", detail: "What, how much and when — no account details" },
    delete: { icon: Trash2, title: "Delete transaction", detail: "You'll be asked to confirm", destructive: true },
  };

  const pick = (action: TransactionActionId) => {
    onClose();
    // Let the sheet close before the next screen or dialog opens.
    const defer =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 0);
    defer(() => onAction(action));
  };

  return (
    <Modal isOpen onClose={onClose} title="More options" maxHeight="75%">
      {actions.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          No other actions for this transaction.
        </Text>
      ) : (
        <View>
          {actions.map((action, index) => {
            const { icon: Icon, title, detail, destructive } = copy[action];
            const color = destructive ? theme.colors.destructive : theme.colors.primary;
            return (
              <Pressable
                key={action}
                onPress={() => pick(action)}
                android_ripple={{ color: surfaces.control, borderless: false }}
                style={({ pressed }) => [
                  styles.row,
                  index < actions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${detail}`}
                testID={`transaction-action-${action}`}
              >
                <View style={[styles.glyph, { backgroundColor: withAlpha(color, surfaces.isDark ? 0.18 : 0.1) }]}>
                  <Icon size={18} color={color} strokeWidth={2.1} />
                </View>
                <View style={styles.text}>
                  <Text
                    style={[
                      styles.title,
                      { color: destructive ? theme.colors.destructive : theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
                    ]}
                  >
                    {title}
                  </Text>
                  <Text style={[styles.detail, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
                    {detail}
                  </Text>
                </View>
                {destructive ? null : <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  empty: { fontSize: 13.5, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 60 },
  glyph: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  text: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 2 },
  title: { fontSize: 15 },
  detail: { fontSize: 12.5, lineHeight: 17 },
});
