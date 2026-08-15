import { useMemo } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  Check,
  CreditCard,
  QrCode,
  Send,
  Share2,
  Trash2,
  Users,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/providers/AuthProvider";
import { useSplits } from "@/hooks/useSplits";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { Participant, Split } from "@/shared/types/split";
import {
  computeSplitProgress,
  generateSplitShareMessage,
} from "@/shared/utils/splitMath";
import { generateUpiLink } from "@/shared/utils/upi";
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
  const { toggleParticipantPaid, settleAll, deleteSplit } = useSplits();

  const progress = useMemo(() => {
    if (!split) {
      return { settledAmount: 0, totalAmount: 0, percentage: 0, isFullySettled: false, unpaidCount: 0 };
    }
    return computeSplitProgress(split);
  }, [split]);

  if (!split) return null;

  const isCreator = split.createdBy === user?.uid;

  const handleTogglePaid = async (index: number, currentPaid: boolean) => {
    if (!split.id) return;
    Haptics.selectionAsync().catch(() => undefined);
    await toggleParticipantPaid(split.id, index, !currentPaid);
  };

  const handleShareReminder = async (participant: Participant) => {
    Haptics.selectionAsync().catch(() => undefined);
    const message = generateSplitShareMessage(
      split,
      participant,
      undefined,
      system.defaultCurrency
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

  const handlePayUpi = async (participant: Participant) => {
    if (!participant.upiId) {
      Alert.alert("No UPI ID", "This participant hasn't specified a UPI ID.");
      return;
    }

    Haptics.selectionAsync().catch(() => undefined);
    const link = generateUpiLink(
      participant.upiId,
      participant.name,
      participant.amount,
      `Split: ${split.title}`
    );

    const canOpen = await Linking.canOpenURL(link).catch(() => false);
    if (canOpen) {
      await Linking.openURL(link);
    } else {
      Alert.alert(
        "UPI Not Supported",
        "Could not launch a UPI app on this device."
      );
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
          {/* Header */}
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
                    {split.category || "SPLIT EXPENSE"}
                  </Text>
                </View>

                {split.settled || progress.isFullySettled ? (
                  <View
                    style={[
                      styles.settledBadge,
                      { backgroundColor: "rgba(34, 197, 94, 0.15)" },
                    ]}
                  >
                    <Text
                      style={[styles.settledBadgeText, { color: "#22C55E" }]}
                    >
                      SETTLED
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
          >
            {/* Progress Card */}
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
                    TOTAL SPLIT AMOUNT
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
                    SETTLED
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

              {/* Progress Bar Track */}
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

            {/* Participants Breakdown List */}
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
                return (
                  <View
                    key={`${p.name}-${index}`}
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
                    <Pressable
                      onPress={() => handleTogglePaid(index, p.paid)}
                      style={styles.participantLeft}
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
                              (YOU)
                            </Text>
                          ) : null}
                        </View>

                        {p.upiId ? (
                          <Text
                            style={[
                              styles.participantUpi,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            {p.upiId}
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

                      {!p.isCurrentUser && !p.paid ? (
                        <View style={styles.actionRow}>
                          {p.upiId ? (
                            <Pressable
                              onPress={() => handlePayUpi(p)}
                              style={({ pressed }) => [
                                styles.iconActionBtn,
                                { backgroundColor: theme.colors.primary },
                                pressed && { opacity: 0.8 },
                              ]}
                            >
                              <CreditCard
                                size={12}
                                color={theme.colors.primaryForeground}
                              />
                            </Pressable>
                          ) : null}

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
                );
              })}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionFooter}>
            <Button
              variant="destructive"
              onPress={handleDelete}
              style={{ flex: 1 }}
            >
              Delete
            </Button>

            {!split.settled && !progress.isFullySettled ? (
              <Button
                variant="primary"
                onPress={handleSettleAll}
                style={{ flex: 2 }}
              >
                Settle All
              </Button>
            ) : (
              <Button
                variant="outline"
                onPress={onClose}
                style={{ flex: 2 }}
              >
                Done
              </Button>
            )}
          </View>
        </View>
      </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
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
  actionFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
});
