import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, BadgeCheck, CheckCircle2, RotateCcw, XCircle } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { appDialog } from "@/lib/appDialog";
import type { EpfTransfer } from "@/shared/features/epf/types";
import {
  canFailTransfer,
  canReverseTransfer,
  isTransferReconciled,
  transferStatusMeta,
} from "@/shared/features/epf/utils/transfers";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  transfer: EpfTransfer | null;
  sourceName: string;
  destinationName: string;
  currency: string;
  onComplete: (id: string) => Promise<boolean>;
  onFail: (id: string, reason: string) => Promise<boolean>;
  onReverse: (id: string, reason: string) => Promise<boolean>;
  onReconcile: (id: string) => Promise<boolean>;
};

/**
 * Transfer detail and actions — KAN-69.
 *
 * Completion and reversal both confirm first: completion moves balance between
 * two employers, and reversal writes a compensating row. Neither should happen
 * on a stray tap.
 */
export function EpfTransferDetailModal({
  isOpen,
  onClose,
  transfer,
  sourceName,
  destinationName,
  currency,
  onComplete,
  onFail,
  onReverse,
  onReconcile,
}: Props) {
  const { theme } = useTheme();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!transfer) return null;

  const meta = transferStatusMeta(transfer);
  const money = (value: number) => formatAmount(value, currency);
  const canSettle = transfer.status === "initiated";

  const run = async (action: () => Promise<boolean>) => {
    setSaving(true);
    const ok = await action();
    setSaving(false);
    if (ok) onClose();
  };

  const confirmComplete = () => {
    appDialog.alert(
      "Complete transfer",
      `Move ${money(transfer.amount)} from ${sourceName} to ${destinationName}? Both balances change; the monthly contribution history is untouched.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Complete", onPress: () => void run(() => onComplete(transfer.id)) },
      ]
    );
  };

  const confirmFail = () => {
    appDialog.alert("Mark as failed", `Record that this transfer did not go through?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark failed",
        style: "destructive",
        onPress: () => void run(() => onFail(transfer.id, reason || "Did not complete")),
      },
    ]);
  };

  const confirmReverse = () => {
    appDialog.alert(
      "Reverse transfer",
      "This creates a compensating transfer in the opposite direction. The original is kept for audit, not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reverse",
          style: "destructive",
          onPress: () => void run(() => onReverse(transfer.id, reason || "Reversed")),
        },
      ]
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer">
      <View style={styles.form}>
        <View style={[styles.route, { backgroundColor: theme.colors.muted }]}>
          <Text style={[styles.routeName, { color: theme.colors.foreground }]} numberOfLines={1}>
            {sourceName}
          </Text>
          <ArrowRight size={theme.iconSize.sm} color={theme.colors.mutedForeground} />
          <Text style={[styles.routeName, { color: theme.colors.foreground }]} numberOfLines={1}>
            {destinationName}
          </Text>
        </View>

        <View>
          <Text style={[styles.amount, { color: theme.colors.foreground }]}>
            {money(transfer.amount)}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {transfer.date} · {meta.label}
            {transfer.reference ? ` · ${transfer.reference}` : ""}
          </Text>
        </View>

        {meta.simulated ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Recorded in Spendly only. Confirm it once you have seen the transfer on your EPFO
            account.
          </Text>
        ) : null}

        {transfer.adjustmentReason ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Adjustment: {transfer.adjustmentReason}
          </Text>
        ) : null}

        {transfer.statusReason ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            {transfer.statusReason}
          </Text>
        ) : null}

        {transfer.reversalOf ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            This is a compensating transfer that reverses an earlier one.
          </Text>
        ) : null}

        {canSettle || canReverseTransfer(transfer) ? (
          <Input
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Optional — recorded with the change"
          />
        ) : null}

        {canSettle ? (
          <>
            <Button onPress={confirmComplete} loading={saving}>
              Complete transfer
            </Button>
            {canFailTransfer(transfer) ? (
              <Pressable onPress={confirmFail} disabled={saving} style={styles.actionRow}>
                <XCircle size={theme.iconSize.sm} color={theme.colors.destructive} />
                <Text style={[styles.actionText, { color: theme.colors.destructive }]}>
                  Mark as failed
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {transfer.status === "completed" && !isTransferReconciled(transfer) ? (
          <Pressable
            onPress={() => void run(() => onReconcile(transfer.id))}
            disabled={saving}
            style={styles.actionRow}
          >
            <BadgeCheck size={theme.iconSize.sm} color={theme.colors.success} />
            <Text style={[styles.actionText, { color: theme.colors.success }]}>
              Confirm against EPFO
            </Text>
          </Pressable>
        ) : null}

        {isTransferReconciled(transfer) ? (
          <View style={styles.actionRow}>
            <CheckCircle2 size={theme.iconSize.sm} color={theme.colors.success} />
            <Text style={[styles.actionText, { color: theme.colors.success }]}>
              Confirmed against EPFO
            </Text>
          </View>
        ) : null}

        {canReverseTransfer(transfer) ? (
          <Pressable onPress={confirmReverse} disabled={saving} style={styles.actionRow}>
            <RotateCcw size={theme.iconSize.sm} color={theme.colors.destructive} />
            <Text style={[styles.actionText, { color: theme.colors.destructive }]}>
              Reverse transfer
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, paddingBottom: 12 },
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 12,
  },
  routeName: { flex: 1, fontSize: 13, fontWeight: "600" },
  amount: { fontSize: 26, fontWeight: "700" },
  meta: { fontSize: 12, marginTop: 4 },
  note: { fontSize: 12, lineHeight: 18 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  actionText: { fontSize: 14, fontWeight: "500" },
});
