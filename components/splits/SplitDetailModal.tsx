import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, Share2, UserMinus, X } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { SplitClaimsSection } from "@/components/splits/SplitClaimsSection";
import { SplitPayQrCard } from "@/components/splits/SplitPayQrCard";
import { UseGiftMoneyModal } from "@/components/splits/UseGiftMoneyModal";
import { Button } from "@/components/ui/Button";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useSplits } from "@/hooks/useSplits";
import { useSplitShareClaims } from "@/hooks/useSplitShareClaims";
import type { Participant, Split } from "@/shared/types/split";
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  computeSplitProgress,
  generateSplitGroupShareMessage,
  generateSplitShareMessage,
  isCollectSpent,
  isCollectSplit,
  isParticipantContributing,
  isParticipantShareSettled,
  optOutBlockedReason,
  othersFullyCollected,
  participantPaidAmount,
  participantRemainingDue,
} from "@/shared/utils/splitMath";
import { getPaymentRequestShareUrl } from "@/shared/utils/paymentRequestUrl";
import { getStoredQrStyleId } from "@/shared/utils/qrStyles";
import { NO_UPI_PAY_LINK_REASON } from "@/shared/utils/splitShareLink";
import { splitClaimDocId } from "@/shared/utils/splitClaims";
import type { SplitShareClaim } from "@/shared/types/splitShareClaim";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";

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
  const displayCurrency = useDisplayCurrency();
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
    optOutParticipant,
    ensureSplitSharing,
    applyPaidClaim,
    dismissClaim,
    setSplitClaimsEnabled,
    planClaim,
  } = useSplits();

  const [collectingKey, setCollectingKey] = useState<string | null>(null);
  const [spendOpen, setSpendOpen] = useState(false);
  // "split" while sharing the group link, otherwise the participant key.
  const [sharing, setSharing] = useState<string | null>(null);
  const [claimWorkingKey, setClaimWorkingKey] = useState<string | null>(null);
  const [togglePending, setTogglePending] = useState(false);
  // Claim being applied through the account picker, so it clears in the same
  // batch as the credit it produces.
  const [pendingCollectClaimKey, setPendingCollectClaimKey] = useState<string | null>(
    null
  );

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
    split.participants.find(
      (p) =>
        !p.isCurrentUser &&
        isParticipantContributing(p) &&
        participantRemainingDue(p) > 0.009
    ) ||
    split.participants.find(
      (p) => !p.isCurrentUser && isParticipantContributing(p)
    );

  const handleTogglePaid = async (participant: Participant, index: number) => {
    if (!split.id) return;
    haptic.selection().catch(() => undefined);

    if (collect) {
      if (spent) return;
      if (participant.isCurrentUser) {
        if (participantRemainingDue(participant) > 0.009) {
          Alert.alert(
            "Mark your extra share?",
            "This records that you are covering the top-up after someone dropped out. It does not move money between accounts.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Mark covered",
                onPress: () => toggleParticipantPaid(split.id!, index, true),
              },
            ]
          );
        }
        return;
      }
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

    await toggleParticipantPaid(split.id, index, !isParticipantShareSettled(participant));
  };

  const handleConfirmCollected = async (accountId: string) => {
    if (!split.id || !collectingKey) return;
    haptic.selection().catch(() => undefined);
    // When this picker was opened from a claim, clearing the claim belongs in
    // the same batch as the credit so the two can never diverge.
    const claimId =
      pendingCollectClaimKey === collectingKey && claimShareId
        ? splitClaimDocId(claimShareId, collectingKey)
        : undefined;
    const ok = await markParticipantCollected(split.id, collectingKey, accountId, {
      claimId,
    });
    if (ok) {
      setCollectingKey(null);
      setPendingCollectClaimKey(null);
    }
  };

  /**
   * Repairs the split's sharing state, then hands back the links. Returns null
   * when there is nothing shareable, and the caller must not open a share sheet
   * in that case -- that was the bug: a missing link silently produced a share
   * message with no URL and no error.
   */
  const prepareSharing = async () => {
    if (!split.id) return null;
    const res = await ensureSplitSharing(split.id, {
      upiId: creatorUpiId,
      payeePhotoUrl: user?.photoURL || undefined,
      qrStyleId: getStoredQrStyleId(),
    });
    if (!res.ok) {
      toast.error(res.message);
      return null;
    }
    return res;
  };

  const handleShareReminder = async (participant: Participant) => {
    if (sharing) return;
    haptic.selection().catch(() => undefined);
    setSharing(participant.key || "person");
    try {
      const prepared = await prepareSharing();
      if (!prepared) return;

      const paymentSlug =
        (participant.key ? prepared.paySlugByKey[participant.key] : undefined) ||
        participant.paymentSlug;
      if (!paymentSlug) {
        // No UPI id means no pay page can exist. Say so, rather than sharing a
        // reminder the recipient has no way to act on.
        toast.error(prepared.payLinkBlockedReason || NO_UPI_PAY_LINK_REASON);
        return;
      }

      const message = generateSplitShareMessage(
        split,
        participant,
        creatorUpiId || undefined,
        displayCurrency,
        getPaymentRequestShareUrl(paymentSlug)
      );
      await Share.share({
        message,
        title: `Payment Reminder: ${split.title}`,
      });
    } catch (err) {
      logError("splitDetailModal.share", err);
    } finally {
      setSharing(null);
    }
  };

  const handleShareSplit = async () => {
    if (sharing) return;
    haptic.selection().catch(() => undefined);
    setSharing("split");
    try {
      const prepared = await prepareSharing();
      if (!prepared) return;
      const message = generateSplitGroupShareMessage(
        split,
        displayCurrency,
        prepared.url
      );
      await Share.share({
        message,
        title: split.title,
      });
    } catch (err) {
      logError("splitDetailModal.shareSplit", err);
    } finally {
      setSharing(null);
    }
  };

  const handleOptOut = (participant: Participant, claimDocId?: string) => {
    if (!split.id || !participant.key) return;
    const blocked = optOutBlockedReason(split, participant.key);
    if (blocked) {
      Alert.alert("Can't drop this person", blocked);
      return;
    }
    const alreadyPaid = participantPaidAmount(participant) > 0.009;
    Alert.alert(
      `${participant.name} won’t contribute?`,
      alreadyPaid
        ? `${participant.name} already paid. That money stays collected — we won't refund it. They’ll stay on the list as not contributing, with nothing extra due. Everyone still in will cover the rest.`
        : `Their share will be split among everyone still in. People who already paid may owe a small top-up.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Drop & recalculate",
          style: "destructive",
          onPress: () =>
            optOutParticipant(split.id!, participant.key as string, {
              claimId: claimDocId,
            }),
        },
      ]
    );
  };

  const claimShareId = split.publicShareId;
  const participantKeys = useMemo(
    () => split.participants.map((p) => p.key),
    [split.participants]
  );
  const { claims } = useSplitShareClaims(claimShareId, participantKeys, {
    enabled: visible && isCreator,
  });
  const claimsEnabled = split.claimsEnabled !== false;

  const claimDocIdFor = (claim: SplitShareClaim) =>
    claimShareId ? splitClaimDocId(claimShareId, claim.participantKey) : undefined;

  const handleApplyClaim = async (claim: SplitShareClaim) => {
    if (!split.id || claimWorkingKey) return;
    const plan = planClaim(split.id, claim);

    if (plan.action === "dismiss") {
      Alert.alert("Can't apply this", plan.reason, [
        { text: "Keep", style: "cancel" },
        {
          text: "Dismiss",
          style: "destructive",
          onPress: () => handleDismissClaim(claim, { skipConfirm: true }),
        },
      ]);
      return;
    }

    if (plan.action === "markCollected") {
      // Reuse the account picker already on that participant's row: the credit
      // needs an account id, which only the organizer can supply.
      setPendingCollectClaimKey(claim.participantKey);
      setCollectingKey(claim.participantKey);
      return;
    }

    if (plan.action === "optOut") {
      const target = split.participants.find((p) => p.key === claim.participantKey);
      if (target) handleOptOut(target, claimDocIdFor(claim));
      return;
    }

    haptic.selection().catch(() => undefined);
    setClaimWorkingKey(claim.participantKey);
    try {
      await applyPaidClaim(split.id, claim);
    } finally {
      setClaimWorkingKey(null);
    }
  };

  const handleDismissClaim = (
    claim: SplitShareClaim,
    options?: { skipConfirm?: boolean }
  ) => {
    if (!split.id) return;
    const run = async () => {
      setClaimWorkingKey(claim.participantKey);
      try {
        await dismissClaim(split.id as string, claim);
      } finally {
        setClaimWorkingKey(null);
      }
    };
    if (options?.skipConfirm) {
      run();
      return;
    }
    Alert.alert(
      "Dismiss this update?",
      "Nothing changes on the split, and that person can send another one.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Dismiss", style: "destructive", onPress: run },
      ]
    );
  };

  const handleToggleClaims = async (enabled: boolean) => {
    if (!split.id || togglePending) return;
    setTogglePending(true);
    try {
      await setSplitClaimsEnabled(split.id, enabled);
    } finally {
      setTogglePending(false);
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

            <View style={styles.headerActions}>
              <Pressable
                onPress={handleShareSplit}
                hitSlop={12}
                disabled={sharing !== null}
                accessibilityRole="button"
                accessibilityLabel="Share split"
                accessibilityState={{
                  busy: sharing === "split",
                  disabled: sharing !== null,
                }}
                style={({ pressed }) => [
                  styles.closeButton,
                  sharing !== null && { opacity: 0.5 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                {sharing === "split" ? (
                  <ActivityIndicator size="small" color={theme.colors.foreground} />
                ) : (
                  <Share2 size={20} color={theme.colors.foreground} />
                )}
              </Pressable>
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
                    currency={displayCurrency}
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
                  currency={displayCurrency}
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

            {isCreator ? (
              <SplitClaimsSection
                split={split}
                claims={claims}
                currency={displayCurrency}
                workingKey={claimWorkingKey}
                claimsEnabled={claimsEnabled}
                togglePending={togglePending}
                onApply={handleApplyClaim}
                onDismiss={handleDismissClaim}
                onToggleClaims={handleToggleClaims}
              />
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
                const contributing = isParticipantContributing(p);
                const settledShare = isParticipantShareSettled(p);
                const remainingDue = participantRemainingDue(p);
                const paidSoFar = participantPaidAmount(p);
                const showTopUp = contributing && paidSoFar > 0.009 && remainingDue > 0.009;
                const canSharePerson =
                  !p.isCurrentUser &&
                  contributing &&
                  remainingDue > 0.009 &&
                  !spent;
                const canOptOut =
                  isCreator &&
                  !p.isCurrentUser &&
                  contributing &&
                  !spent &&
                  Boolean(p.key);
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
                        disabled={
                          (collect && ((p.isCurrentUser && remainingDue <= 0.009) || spent)) ||
                          !contributing
                        }
                      >
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: settledShare
                                ? "#22C55E"
                                : "transparent",
                              borderColor: settledShare
                                ? "#22C55E"
                                : theme.colors.mutedForeground,
                            },
                          ]}
                        >
                          {settledShare ? (
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
                                  textDecorationLine: settledShare || !contributing
                                    ? "line-through"
                                    : "none",
                                  opacity: settledShare || !contributing ? 0.7 : 1,
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

                          {!contributing ? (
                            <Text
                              style={[
                                styles.participantUpi,
                                { color: theme.colors.mutedForeground },
                              ]}
                            >
                              Won’t contribute
                            </Text>
                          ) : showTopUp ? (
                            <Text
                              style={[
                                styles.participantUpi,
                                { color: theme.colors.mutedForeground },
                              ]}
                            >
                              Paid {paidSoFar.toFixed(2)} · new share {p.amount.toFixed(2)} · collect extra {remainingDue.toFixed(2)}
                            </Text>
                          ) : collect && p.paid && !p.isCurrentUser ? (
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
                          ) : remainingDue > 0.009 && paidSoFar <= 0.009 ? (
                            <Text
                              style={[
                                styles.participantUpi,
                                { color: theme.colors.mutedForeground },
                              ]}
                            >
                              Remaining due
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>

                      <View style={styles.participantRight}>
                        <Amount
                          value={contributing ? p.amount : paidSoFar}
                          currency={displayCurrency}
                          ghostable
                          style={{
                            fontSize: theme.typography.sm,
                            fontWeight: "800",
                            color: settledShare
                              ? theme.colors.mutedForeground
                              : theme.colors.foreground,
                          }}
                        />

                        {canSharePerson || canOptOut ? (
                          <View style={styles.actionRow}>
                            {canSharePerson ? (
                              <Pressable
                                onPress={() => handleShareReminder(p)}
                                disabled={sharing !== null}
                                accessibilityRole="button"
                                accessibilityLabel={`Share with ${p.name}`}
                                accessibilityState={{
                                  busy: sharing === p.key,
                                  disabled: sharing !== null,
                                }}
                                style={({ pressed }) => [
                                  styles.iconActionBtn,
                                  {
                                    backgroundColor: isDark
                                      ? "rgba(255,255,255,0.08)"
                                      : "rgba(0,0,0,0.06)",
                                  },
                                  sharing !== null && { opacity: 0.5 },
                                  pressed && { opacity: 0.8 },
                                ]}
                              >
                                {sharing === p.key ? (
                                  <ActivityIndicator
                                    size="small"
                                    color={theme.colors.foreground}
                                  />
                                ) : (
                                  <Share2
                                    size={12}
                                    color={theme.colors.foreground}
                                  />
                                )}
                              </Pressable>
                            ) : null}
                            {canOptOut ? (
                              <Pressable
                                onPress={() => handleOptOut(p)}
                                accessibilityRole="button"
                                accessibilityLabel={`${p.name} won’t contribute`}
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
                                <UserMinus
                                  size={12}
                                  color={theme.colors.destructive}
                                />
                              </Pressable>
                            ) : null}
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
    borderCurve: "continuous",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    borderCurve: "continuous",
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
    borderCurve: "continuous",
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
