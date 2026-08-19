import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Check, Share2, X } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { SplitPayQrCard } from "@/components/splits/SplitPayQrCard";
import { UseGiftMoneyModal } from "@/components/splits/UseGiftMoneyModal";
import { Button } from "@/components/ui/Button";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSplits } from "@/hooks/useSplits";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Participant, Split } from "@/shared/types/split";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  computeSplitProgress,
  generateSplitShareMessage,
  isCollectSpent,
  isCollectSplit,
  othersFullyCollected,
} from "@/shared/utils/splitMath";
import { getPaymentRequestShareUrl, getPublicAppOrigin } from "@/shared/utils/paymentRequestUrl";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { logError } from "@/lib/errors";

export interface SplitDetailModalProps {
  visible: boolean;
  split: Split | null;
  onClose: () => void;
}

export function SplitDetailModal({
  visible,
  split,
  onClose,
}: SplitDetailModalProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { user } = useAuth();
  const { settings: system } = useSystemSettings();
  const { settings: userSettings } = useSettings();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const {
    toggleParticipantPaid,
    settleAll,
    deleteSplit,
    markParticipantCollected,
    unmarkParticipantCollected,
    spendCollectPot,
  } = useSplits();

  const [collectingKey, setCollectingKey] = useState<string | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);

  const progress = useMemo(() => {
    if (!split) {
      return {
        settledAmount: 0,
        totalAmount: 0,
        percentage: 0,
        isFullySettled: false,
        unpaidCount: 0,
      };
    }
    return computeSplitProgress(split);
  }, [split]);

  const typeMap = useMemo(
    () => new Map(accountTypes.map((t) => [t.id, t.name])),
    [accountTypes]
  );
  const receiveAccounts = useMemo(() => {
    const banks = accounts.filter(
      (a) => getAccountKind(typeMap.get(a.typeId) || "") !== "credit"
    );
    return banks.length > 0 ? banks : accounts;
  }, [accounts, typeMap]);

  if (!split) return null;

  const isCreator = split.createdBy === user?.uid;
  const collect = isCollectSplit(split);
  const spent = isCollectSpent(split);
  const creatorUpiId = userSettings.upiId.trim();
  const qrTarget =
    split.participants.find((p) => !p.isCurrentUser && !p.paid) ||
    split.participants.find((p) => !p.isCurrentUser);

  const handleTogglePaid = async (participant: Participant, index: number) => {
    if (!split.id) return;
    Haptics.selectionAsync().catch(() => undefined);

    if (collect) {
      if (participant.isCurrentUser || spent) return;
      const key = participant.key;
      if (!key) return;
      if (participant.paid) {
        Alert.alert(
          "Undo collection?",
          `Remove ${participant.name}'s collection and reverse the credit on the receiving account?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Undo",
              style: "destructive",
              onPress: () => unmarkParticipantCollected(split.id!, key),
            },
          ]
        );
        return;
      }
      setCollectingKey(key);
      return;
    }

    await toggleParticipantPaid(split.id, index, !participant.paid);
  };

  const handleConfirmCollected = async (accountId: string) => {
    if (!split.id || !collectingKey) return;
    Haptics.selectionAsync().catch(() => undefined);
    const ok = await markParticipantCollected(split.id, collectingKey, accountId);
    if (ok) setCollectingKey(null);
  };

  const handleShareReminder = async (participant: Participant) => {
    Haptics.selectionAsync().catch(() => undefined);
    const origin = getPublicAppOrigin();
    const shareUrl =
      origin && participant.paymentSlug
        ? getPaymentRequestShareUrl(participant.paymentSlug)
        : undefined;
    const message = generateSplitShareMessage(
      split,
      participant,
      creatorUpiId || undefined,
      system.defaultCurrency,
      shareUrl
    );

    try {
      await Share.share({
        message,
        title: `Payment Reminder: ${split.title}`,
      });
    } catch (err) {
      logError("splitDetailModal.share", err);
    }
  };

  const handleSettleAll = async () => {
    if (!split.id) return;
    Alert.alert(
      "Mark All Settled",
      "Are you sure you want to mark all participants as paid?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle All",
          onPress: async () => {
            await settleAll(split.id!);
          },
        },
      ]
    );
  };

  const handleUseGift = () => {
    if (!othersFullyCollected(split)) {
      Alert.alert(
        "Some people haven't paid",
        "You can still buy the gift now. Unpaid shares won't be credited.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => setSpendOpen(true) },
        ]
      );
      return;
    }
    setSpendOpen(true);
  };

  const handleDelete = () => {
    if (!split.id) return;
    Alert.alert(
      "Delete Split",
      `Are you sure you want to delete "${split.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteSplit(split.id!);
            onClose();
          },
        },
      ]
    );
  };

  const statusLabel = spent
    ? "SPENT"
    : split.settled || progress.isFullySettled
      ? "SETTLED"
      : collect
        ? "COLLECTING"
        : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.categoryBadge,
                    { backgroundColor: "rgba(107, 99, 255, 0.15)" },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryBadgeText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {split.category || (collect ? "GIFT POT" : "SPLIT EXPENSE")}
                  </Text>
                </View>

                {statusLabel ? (
                  <View
                    style={[
                      styles.settledBadge,
                      {
                        backgroundColor:
                          statusLabel === "COLLECTING"
                            ? "rgba(107, 99, 255, 0.15)"
                            : "rgba(34, 197, 94, 0.15)",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.settledBadgeText,
                        {
                          color:
                            statusLabel === "COLLECTING"
                              ? theme.colors.primary
                              : "#22C55E",
                        },
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text
                style={[styles.title, { color: theme.colors.cardForeground }]}
                numberOfLines={1}
              >
                {split.title}
              </Text>
              <Text
                style={[
                  styles.subtitle,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                Organized by {split.createdByName || "Me"}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <X size={20} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
          >
            <View
              style={[
                styles.progressCard,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.03)"
                    : "rgba(0,0,0,0.02)",
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View style={styles.progressHeader}>
                <View>
                  <Text
                    style={[
                      styles.progressLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    {collect ? "TARGET AMOUNT" : "TOTAL SPLIT AMOUNT"}
                  </Text>
                  <Amount
                    value={split.totalAmount}
                    currency={system.defaultCurrency}
                    ghostable
                    style={{
                      fontSize: 22,
                      fontWeight: "900",
                      color: theme.colors.foreground,
                    }}
                  />
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={[
                      styles.progressLabel,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    {collect ? "COLLECTED" : "SETTLED"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: progress.isFullySettled
                        ? "#22C55E"
                        : theme.colors.primary,
                    }}
                  >
                    {progress.percentage}%
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.colors.muted },
                ]}
              >
                <View
                  style={[
                    styles.progressBar,
                    {
                      width: `${progress.percentage}%`,
                      backgroundColor: progress.isFullySettled
                        ? "#22C55E"
                        : theme.colors.primary,
                    },
                  ]}
                />
              </View>
            </View>

            {isCreator && qrTarget && !spent ? (
              creatorUpiId ? (
                <SplitPayQrCard
                  split={split}
                  participant={qrTarget}
                  creatorUpiId={creatorUpiId}
                  currency={system.defaultCurrency}
                />
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  Set your UPI ID in Settings to show a QR code friends can scan.
                </Text>
              )
            ) : null}

            <View style={{ gap: 8 }}>
              <Text
                style={[
                  styles.sectionHeading,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                PARTICIPANTS ({split.participants.length})
              </Text>

              {split.participants.map((p, index) => {
                const rowKey = p.key || `${p.name}-${index}`;
                const picking = collect && collectingKey === p.key;
                return (
                  <View
                    key={rowKey}
                    style={[
                      styles.participantRow,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.03)"
                          : "rgba(0,0,0,0.02)",
                        borderColor: theme.colors.border,
                      },
                    ]}
                  >
                    <View style={styles.participantMain}>
                      <Pressable
                        onPress={() => handleTogglePaid(p, index)}
                        style={styles.participantLeft}
                        disabled={collect && (p.isCurrentUser || spent)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: p.paid
                                ? "#22C55E"
                                : "transparent",
                              borderColor: p.paid
                                ? "#22C55E"
                                : theme.colors.mutedForeground,
                            },
                          ]}
                        >
                          {p.paid ? (
                            <Check size={12} color="#FFFFFF" strokeWidth={3} />
                          ) : null}
                        </View>

                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Text
                              style={[
                                styles.participantName,
                                {
                                  color: theme.colors.foreground,
                                  textDecorationLine: p.paid
                                    ? "line-through"
                                    : "none",
                                  opacity: p.paid ? 0.7 : 1,
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {p.name}
                            </Text>
                            {p.isCurrentUser ? (
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: theme.colors.primary,
                                  fontWeight: "700",
                                }}
                              >
                                {collect ? "(YOU · PLEDGED)" : "(YOU)"}
                              </Text>
                            ) : null}
                          </View>

                          {collect && p.paid && !p.isCurrentUser ? (
                            <Text
                              style={[
                                styles.participantUpi,
                                { color: theme.colors.mutedForeground },
                              ]}
                            >
                              Collected
                              {p.receivedAccountId
                                ? ` · ${
                                    accounts.find(
                                      (a) => a.id === p.receivedAccountId
                                    )?.name || "account"
                                  }`
                                : ""}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>

                      <View style={styles.participantRight}>
                        <Amount
                          value={p.amount}
                          currency={system.defaultCurrency}
                          ghostable
                          style={{
                            fontSize: theme.typography.sm,
                            fontWeight: "800",
                            color: p.paid
                              ? theme.colors.mutedForeground
                              : theme.colors.foreground,
                          }}
                        />

                        {!p.isCurrentUser && !p.paid && !spent ? (
                          <View style={styles.actionRow}>
                            <Pressable
                              onPress={() => handleShareReminder(p)}
                              style={({ pressed }) => [
                                styles.iconActionBtn,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(255,255,255,0.08)"
                                    : "rgba(0,0,0,0.06)",
                                },
                                pressed && { opacity: 0.8 },
                              ]}
                            >
                              <Share2
                                size={12}
                                color={theme.colors.foreground}
                              />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {picking ? (
                      <View style={{ gap: 8, paddingTop: 8 }}>
                        <Text
                          style={[
                            styles.sectionHeading,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          RECEIVED INTO ACCOUNT
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8 }}
                        >
                          {receiveAccounts.map((acc) => (
                            <Pressable
                              key={acc.id}
                              onPress={() => handleConfirmCollected(acc.id)}
                              style={[
                                styles.chip,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(255,255,255,0.06)"
                                    : "rgba(0,0,0,0.04)",
                                  borderColor: theme.colors.border,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: theme.colors.foreground,
                                }}
                              >
                                {acc.name}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                        <Pressable
                          onPress={() => setCollectingKey(null)}
                          style={({ pressed }) => [
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: theme.colors.mutedForeground,
                            }}
                          >
                            Cancel
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actionFooter}>
            <Button
              variant="destructive"
              onPress={handleDelete}
              style={{ flex: 1 }}
            >
              Delete
            </Button>

            {collect && isCreator && !spent ? (
              <Button
                variant="primary"
                onPress={handleUseGift}
                style={{ flex: 2 }}
              >
                Use money for gift
              </Button>
            ) : !collect && !split.settled && !progress.isFullySettled ? (
              <Button
                variant="primary"
                onPress={handleSettleAll}
                style={{ flex: 2 }}
              >
                Settle All
              </Button>
            ) : (
              <Button variant="outline" onPress={onClose} style={{ flex: 2 }}>
                Done
              </Button>
            )}
          </View>
        </View>
      </View>

      <UseGiftMoneyModal
        visible={spendOpen}
        split={split}
        onClose={() => setSpendOpen(false)}
        onConfirm={async (amount, accountId) => {
          if (!split.id) return false;
          return spendCollectPot(split.id, amount, accountId);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "90%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  settledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  settledBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
  },
  closeButton: {
    padding: 4,
  },
  scrollArea: {
    maxHeight: 460,
  },
  progressCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  participantRow: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  participantMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  participantLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  participantName: {
    fontSize: 13,
    fontWeight: "700",
  },
  participantUpi: {
    fontSize: 10,
  },
  participantRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconActionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});
