import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ban, CheckCircle2, Pencil, Trash2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAccounts } from "@/hooks/useAccounts";
import type { AddReceivableRepaymentInput } from "@/hooks/useReceivables";
import { useSpaces } from "@/hooks/useSpaces";
import { toast } from "@/lib/toast";
import type { Receivable, ReceivableRepayment } from "@/shared/types/receivable";
import {
  PERSON_TYPE_LABELS,
  RECEIVABLE_STATUS_LABELS,
} from "@/shared/types/receivable";
import {
  validateReceivableRepayment,
  type ReceivableSummary,
} from "@/shared/utils/receivableMath";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

export interface ReceivableDetailModalProps {
  visible: boolean;
  receivable: Receivable | null;
  summary: ReceivableSummary | null;
  repayments: ReceivableRepayment[];
  currency?: string;
  onClose: () => void;
  onAddRepayment: (input: AddReceivableRepaymentInput) => Promise<string | null>;
  onDeleteRepayment: (
    repaymentId: string,
    receivableId: string
  ) => Promise<boolean>;
  onUpdateReceivable: (
    id: string,
    updates: Partial<Receivable>
  ) => Promise<boolean>;
  onMarkSettled: (id: string) => Promise<boolean>;
  onCancelReceivable: (id: string) => Promise<boolean>;
  onDeleteReceivable: (id: string) => Promise<boolean>;
}

export function ReceivableDetailModal({
  visible,
  receivable,
  summary,
  repayments,
  currency,
  onClose,
  onAddRepayment,
  onDeleteRepayment,
  onUpdateReceivable,
  onMarkSettled,
  onCancelReceivable,
  onDeleteReceivable,
}: ReceivableDetailModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { accounts } = useAccounts();
  const { spaces } = useSpaces();

  const [isRepaying, setIsRepaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [receivedAccountId, setReceivedAccountId] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(todayDateKey());
  const [repaymentNote, setRepaymentNote] = useState("");
  const [editPersonName, setEditPersonName] = useState("");
  const [editPurpose, setEditPurpose] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editOriginalAmount, setEditOriginalAmount] = useState("");
  const [editSpaceId, setEditSpaceId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numericAmount = Number(amount);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((account) => map.set(account.id, account.name));
    return map;
  }, [accounts]);

  const spaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    spaces.forEach((space) => {
      if (space.id) map.set(space.id, space.name);
    });
    return map;
  }, [spaces]);

  const activeSpaces = useMemo(
    () =>
      spaces.filter(
        (space) => space.status === "ACTIVE" || space.id === editSpaceId
      ),
    [spaces, editSpaceId]
  );

  const hasRepayments = repayments.length > 0;
  const canEditAmount =
    summary != null &&
    (editOriginalAmount === "" ||
      Number(editOriginalAmount) >= summary.totalReceived);

  if (!receivable || !summary) {
    return (
      <Modal isOpen={visible} onClose={onClose} title="Receivable">
        <View />
      </Modal>
    );
  }

  const isSettled =
    summary.status === "FULLY_SETTLED" || summary.status === "CANCELLED";

  const resetRepaymentForm = () => {
    setAmount("");
    setReceivedAccountId("");
    setRepaymentDate(todayDateKey());
    setRepaymentNote("");
    setIsRepaying(false);
  };

  const startEditing = () => {
    setEditPersonName(receivable.personName);
    setEditPurpose(receivable.purpose ?? "");
    setEditNote(receivable.note ?? "");
    setEditDueDate(receivable.dueDate ?? "");
    setEditOriginalAmount(String(receivable.originalAmount));
    setEditSpaceId(receivable.spaceId ?? "");
    setIsEditing(true);
    setIsRepaying(false);
  };

  const resetEditForm = () => {
    setIsEditing(false);
  };

  const handleRepay = async () => {
    if (!receivable.id) return;

    if (!isValidDateKey(repaymentDate)) {
      toast.error("Repayment date must be YYYY-MM-DD");
      return;
    }

    const validation = validateReceivableRepayment(numericAmount, summary);
    if (!validation.ok) {
      toast.error(validation.error ?? "Invalid repayment");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await onAddRepayment({
        receivableId: receivable.id,
        amount: numericAmount,
        receivedAccountId: receivedAccountId || null,
        date: repaymentDate,
        note: repaymentNote.trim(),
      });
      if (created) resetRepaymentForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!receivable.id) return;

    if (!editPersonName.trim()) {
      toast.error("Person name is required");
      return;
    }

    const numAmount = Number(editOriginalAmount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      toast.error("Enter a valid original amount");
      return;
    }

    if (numAmount < summary.totalReceived) {
      toast.error(
        `Original amount cannot be less than ${summary.totalReceived} already received`
      );
      return;
    }

    if (editDueDate.trim() && !isValidDateKey(editDueDate.trim())) {
      toast.error("Due date must be YYYY-MM-DD");
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await onUpdateReceivable(receivable.id, {
        personName: editPersonName.trim(),
        purpose: editPurpose.trim(),
        note: editNote.trim(),
        dueDate: editDueDate.trim() ? editDueDate.trim() : null,
        originalAmount: numAmount,
        spaceId: editSpaceId || null,
      });
      if (ok) resetEditForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteReceivable = () => {
    if (!receivable.id) return;
    Alert.alert(
      "Delete receivable?",
      "This removes the receivable and all of its repayment records. Expenses and accounts are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void onDeleteReceivable(receivable.id as string);
          },
        },
      ]
    );
  };

  const confirmCancelReceivable = () => {
    if (!receivable.id) return;
    Alert.alert(
      "Cancel receivable?",
      "This marks the receivable as cancelled. Outstanding balance will no longer count toward totals.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Receivable",
          style: "destructive",
          onPress: () => {
            void onCancelReceivable(receivable.id as string);
          },
        },
      ]
    );
  };

  const confirmDeleteRepayment = (repaymentId: string) => {
    if (!receivable.id) return;
    Alert.alert("Remove repayment?", "The outstanding balance will go back up.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void onDeleteRepayment(repaymentId, receivable.id as string);
        },
      },
    ]);
  };

  const pillStyle = (isActive: boolean) => ({
    backgroundColor: isActive
      ? theme.colors.primary
      : isDark
        ? "rgba(255,255,255,0.06)"
        : "rgba(0,0,0,0.04)",
    borderColor: isActive ? theme.colors.primary : theme.colors.border,
  });

  const pillTextStyle = (isActive: boolean) => ({
    color: isActive ? theme.colors.primaryForeground : theme.colors.foreground,
    fontWeight: isActive ? ("700" as const) : ("500" as const),
  });

  const rows: { label: string; value: number }[] = [
    { label: "Original amount", value: summary.originalAmount },
    { label: "Total received", value: summary.totalReceived },
    { label: "Outstanding", value: summary.outstandingAmount },
  ];

  return (
    <Modal isOpen={visible} onClose={onClose} title={receivable.personName}>
      <View style={styles.body}>
        <View style={styles.headerMeta}>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            {PERSON_TYPE_LABELS[receivable.personType]} · Lent on{" "}
            {receivable.lentDate}
            {receivable.dueDate ? ` · Due ${receivable.dueDate}` : ""}
          </Text>
          {receivable.purpose ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {receivable.purpose}
            </Text>
          ) : null}
          {receivable.sourceAccountId ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              Paid from{" "}
              {accountNameById.get(receivable.sourceAccountId) ?? "an account"}
              {hasRepayments ? " (locked)" : ""}
            </Text>
          ) : null}
          {receivable.spaceId ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              Space: {spaceNameById.get(receivable.spaceId) ?? "Unknown"}
            </Text>
          ) : null}
          {receivable.note ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {receivable.note}
            </Text>
          ) : null}
        </View>

        {summary.status === "FULLY_SETTLED" ? (
          <View
            style={[styles.settledBanner, { backgroundColor: "rgba(16,185,129,0.14)" }]}
          >
            <CheckCircle2 size={18} color="#10B981" />
            <View>
              <Text style={[styles.settledTitle, { color: "#10B981" }]}>
                Fully settled
              </Text>
              {summary.settledDate ? (
                <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
                  Settled on {summary.settledDate}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {summary.status === "CANCELLED" ? (
          <View
            style={[styles.settledBanner, { backgroundColor: "rgba(107,114,128,0.14)" }]}
          >
            <Ban size={18} color="#6B7280" />
            <View>
              <Text style={[styles.settledTitle, { color: "#6B7280" }]}>
                Cancelled
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.breakdown}>
          {rows.map((row) => (
            <View key={row.label} style={styles.breakdownRow}>
              <Text
                style={[styles.rowLabel, { color: theme.colors.mutedForeground }]}
              >
                {row.label}
              </Text>
              <Amount
                value={row.value}
                currency={currency}
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: theme.colors.foreground,
                }}
              />
            </View>
          ))}

          <View
            style={[styles.totalRow, { borderTopColor: theme.colors.border }]}
          >
            <Text style={[styles.totalLabel, { color: theme.colors.foreground }]}>
              Outstanding
            </Text>
            <Amount
              value={summary.outstandingAmount}
              currency={currency}
              style={{
                fontSize: 18,
                fontWeight: "900",
                color: theme.colors.foreground,
              }}
            />
          </View>

          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            Status: {RECEIVABLE_STATUS_LABELS[summary.status]}
          </Text>
        </View>

        {isSettled ? null : isEditing ? (
          <View style={styles.formSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Edit Receivable
            </Text>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Person Name
              </Text>
              <Input value={editPersonName} onChangeText={setEditPersonName} />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Original Amount
              </Text>
              <Input
                value={editOriginalAmount}
                onChangeText={setEditOriginalAmount}
                keyboardType="decimal-pad"
                placeholder={`Min ${summary.totalReceived}`}
              />
              {!canEditAmount ? (
                <Text style={[styles.meta, { color: "#EF4444" }]}>
                  Cannot be less than {summary.totalReceived} already received
                </Text>
              ) : null}
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Purpose
              </Text>
              <Input value={editPurpose} onChangeText={setEditPurpose} />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Due Date (optional)
              </Text>
              <Input
                value={editDueDate}
                onChangeText={setEditDueDate}
                placeholder="YYYY-MM-DD"
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Note
              </Text>
              <Input value={editNote} onChangeText={setEditNote} />
            </View>

            {activeSpaces.length > 0 ? (
              <View style={styles.group}>
                <Text style={[styles.label, { color: theme.colors.foreground }]}>
                  Space
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillRow}
                >
                  <Pressable
                    onPress={() => setEditSpaceId("")}
                    style={[styles.pill, pillStyle(editSpaceId === "")]}
                  >
                    <Text
                      style={[styles.pillText, pillTextStyle(editSpaceId === "")]}
                    >
                      None
                    </Text>
                  </Pressable>
                  {activeSpaces.map((space) => {
                    const isActive = editSpaceId === space.id;
                    return (
                      <Pressable
                        key={space.id}
                        onPress={() => {
                          haptic.selection().catch(() => undefined);
                          setEditSpaceId(space.id ?? "");
                        }}
                        style={[styles.pill, pillStyle(isActive)]}
                      >
                        <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                          {space.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Button
                onPress={handleSaveEdit}
                loading={isSubmitting}
                disabled={!canEditAmount || !editPersonName.trim() || isSubmitting}
                style={{ flex: 1 }}
              >
                <Text
                  style={{ fontWeight: "800", color: theme.colors.primaryForeground }}
                >
                  Save Changes
                </Text>
              </Button>
              <Button variant="outline" onPress={resetEditForm}>
                <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
                  Cancel
                </Text>
              </Button>
            </View>
          </View>
        ) : isRepaying ? (
          <View style={styles.formSection}>
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Record Repayment
            </Text>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Amount Received
              </Text>
              <Input
                value={amount}
                onChangeText={setAmount}
                placeholder={`Up to ${summary.outstandingAmount}`}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Received Into Account
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                <Pressable
                  onPress={() => setReceivedAccountId("")}
                  style={[styles.pill, pillStyle(receivedAccountId === "")]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      pillTextStyle(receivedAccountId === ""),
                    ]}
                  >
                    None
                  </Text>
                </Pressable>
                {accounts.map((account) => {
                  const isActive = receivedAccountId === account.id;
                  return (
                    <Pressable
                      key={account.id}
                      onPress={() => {
                        haptic.selection().catch(() => undefined);
                        setReceivedAccountId(account.id);
                      }}
                      style={[styles.pill, pillStyle(isActive)]}
                    >
                      <Text style={[styles.pillText, pillTextStyle(isActive)]}>
                        {account.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Date
              </Text>
              <Input
                value={repaymentDate}
                onChangeText={setRepaymentDate}
                placeholder="YYYY-MM-DD"
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: theme.colors.foreground }]}>
                Note (optional)
              </Text>
              <Input
                value={repaymentNote}
                onChangeText={setRepaymentNote}
                placeholder="e.g. Partial repayment"
              />
            </View>

            <View style={styles.actionRow}>
              <Button
                onPress={handleRepay}
                loading={isSubmitting}
                disabled={!amount || isSubmitting}
                style={{ flex: 1 }}
              >
                <Text
                  style={{ fontWeight: "800", color: theme.colors.primaryForeground }}
                >
                  Save Repayment
                </Text>
              </Button>
              <Button variant="outline" onPress={resetRepaymentForm}>
                <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
                  Cancel
                </Text>
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Button onPress={() => setIsRepaying(true)} style={{ flex: 1 }}>
              <Text
                style={{ fontWeight: "800", color: theme.colors.primaryForeground }}
              >
                Record Repayment
              </Text>
            </Button>
            <Button variant="outline" onPress={startEditing}>
              <Pencil size={16} color={theme.colors.foreground} />
              <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>
                Edit
              </Text>
            </Button>
          </View>
        )}

        {!isEditing &&
        receivable.status !== "FULLY_SETTLED" &&
        receivable.status !== "CANCELLED" &&
        summary.outstandingAmount <= 0 ? (
          <Button
            variant="outline"
            onPress={() => {
              if (receivable.id) void onMarkSettled(receivable.id);
            }}
          >
            <CheckCircle2 size={16} color="#10B981" />
            <Text style={{ fontWeight: "700", color: "#10B981" }}>
              Mark Settled
            </Text>
          </Button>
        ) : null}

        <View style={styles.group}>
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Repayment History
          </Text>

          {repayments.length === 0 ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              No repayments recorded yet.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {repayments.map((repayment) => (
                <View
                  key={repayment.id}
                  style={[
                    styles.historyRow,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Amount
                      value={repayment.amount}
                      currency={currency}
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                    />
                    <Text
                      style={[styles.meta, { color: theme.colors.mutedForeground }]}
                    >
                      {repayment.date}
                      {repayment.receivedAccountId
                        ? ` · ${accountNameById.get(repayment.receivedAccountId) ?? "Account"}`
                        : ""}
                    </Text>
                    {repayment.note ? (
                      <Text
                        style={[styles.meta, { color: theme.colors.mutedForeground }]}
                      >
                        {repayment.note}
                      </Text>
                    ) : null}
                  </View>

                  {isSettled ? null : (
                    <Pressable
                      onPress={() => confirmDeleteRepayment(repayment.id as string)}
                      hitSlop={8}
                      accessibilityLabel="Remove repayment"
                      accessibilityRole="button"
                    >
                      <Trash2 size={16} color={theme.colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {isSettled ? null : (
          <Button variant="outline" onPress={confirmCancelReceivable}>
            <Ban size={16} color={theme.colors.mutedForeground} />
            <Text style={{ fontWeight: "700", color: theme.colors.mutedForeground }}>
              Cancel Receivable
            </Text>
          </Button>
        )}

        <Button variant="outline" onPress={confirmDeleteReceivable}>
          <Trash2 size={16} color={theme.colors.destructive} />
          <Text style={{ fontWeight: "700", color: theme.colors.destructive }}>
            Delete Receivable
          </Text>
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 18,
  },
  headerMeta: {
    gap: 2,
  },
  meta: {
    fontSize: 11,
  },
  settledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  settledTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  breakdown: {
    gap: 8,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 12,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  formSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  group: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  pillRow: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    padding: 12,
  },
});
