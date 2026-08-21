/**
 * The self-service controls under a person's row on the public split page.
 *
 * Collapsed to a single "This is me" disclosure by default so the page still
 * reads as a summary of who owes what. Every action passes through one confirm
 * step because there is no undo: an anonymous visitor cannot be allowed to
 * withdraw a claim (any link-holder could then withdraw anyone's, leaving the
 * slot dead until the organizer clears it), so the guard is up front instead.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { SplitPublicShare } from "@/shared/types/splitPublicShare";
import type { SplitClaimType } from "@/shared/types/splitShareClaim";
import { formatAmount } from "@/shared/utils/formatCurrency";
import {
  clampClaimAmount,
  pendingClaimLabel,
  publicClaimBlockedReason,
  type PendingClaimRow,
} from "@/shared/utils/splitClaims";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type PublicSplitClaimRowProps = {
  row: PendingClaimRow;
  share: SplitPublicShare;
  currency: string;
  /** Participant key currently being submitted, if any. */
  submitting: string | null;
  onSubmit: (params: {
    participantKey: string;
    type: SplitClaimType;
    amount: number;
  }) => Promise<boolean>;
};

export function PublicSplitClaimRow({
  row,
  share,
  currency,
  submitting,
  onSubmit,
}: PublicSplitClaimRowProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState(String(row.remainingDue || row.amount));
  const [confirming, setConfirming] = useState<SplitClaimType | null>(null);

  const muted = theme.colors.mutedForeground;
  const busy = submitting === row.claimKey;
  const anyBusy = submitting !== null;

  // A pending claim replaces the actions: the slot is used up until the
  // organizer applies or dismisses it.
  const pending = pendingClaimLabel(row, {
    organizerName: share.organizerName,
    currency,
  });
  if (pending) {
    return (
      <View
        style={[
          styles.chip,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.chipText, { color: muted }]}>{pending}</Text>
      </View>
    );
  }

  // Organizer rows, dropouts, settled shares and closed links get nothing.
  if (row.isOrganizer || row.optedOut || row.remainingDue <= 0.009) return null;
  if (publicClaimBlockedReason(share, row.claimKey)) return null;

  const participantKey = row.claimKey as string;
  // A collect pot is credited into one account as a whole remaining balance,
  // so an arbitrary partial cannot be honoured — the claim is all-or-nothing.
  const allowsPartial = share.kind !== "collect";

  const submit = async (type: SplitClaimType) => {
    if (anyBusy) return;
    const amount =
      type === "optOut"
        ? 0
        : allowsPartial
          ? resolveAmount()
          : row.remainingDue;
    if (amount === null) return;
    const ok = await onSubmit({ participantKey, type, amount });
    if (ok) {
      setConfirming(null);
      setOpen(false);
    }
  };

  const resolveAmount = (): number | null => {
    const result = clampClaimAmount(
      row,
      amountText,
      share.claimAmountMax ?? row.amount
    );
    if ("error" in result) {
      setAmountText(String(row.remainingDue || row.amount));
      return null;
    }
    return result.amount;
  };

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`I am ${row.name}`}
        style={({ pressed }) => [styles.disclosure, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.disclosureText, { color: theme.colors.primary }]}>
          This is me
        </Text>
      </Pressable>
    );
  }

  const confirmCopy =
    confirming === "optOut"
      ? `Your share gets split among everyone still in. ${share.organizerName} has to confirm this.`
      : confirming === "paid"
        ? `Tell ${share.organizerName} you've paid ${formatAmount(
            allowsPartial ? resolvePreview() : row.remainingDue,
            currency,
            { fixedDecimals: true }
          )} in total?`
        : null;

  function resolvePreview(): number {
    const result = clampClaimAmount(
      row,
      amountText,
      share.claimAmountMax ?? row.amount
    );
    return "error" in result ? row.remainingDue : result.amount;
  }

  return (
    <View style={styles.panel}>
      {confirmCopy === null ? (
        <View style={styles.panelBody}>
          {allowsPartial ? (
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: muted }]}>
                How much have you paid in total?
              </Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                inputMode="decimal"
                accessibilityLabel="Amount paid in total"
                placeholder={String(row.amount)}
                placeholderTextColor={muted}
                style={[
                  styles.input,
                  {
                    color: theme.colors.foreground,
                    borderColor: theme.colors.border,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.03)",
                  },
                ]}
              />
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => setConfirming("paid")}
              disabled={anyBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="I have paid"
              accessibilityState={{ disabled: anyBusy }}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: theme.colors.primary },
                anyBusy && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                style={[styles.actionText, { color: theme.colors.primaryForeground }]}
              >
                I&apos;ve paid
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setConfirming("optOut")}
              disabled={anyBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="I will not contribute"
              accessibilityState={{ disabled: anyBusy }}
              style={({ pressed }) => [
                styles.action,
                styles.actionGhost,
                { borderColor: theme.colors.border },
                anyBusy && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.actionText, { color: muted }]}>
                I won&apos;t contribute
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.cancelText, { color: muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.panelBody}>
          <Text style={[styles.fieldLabel, { color: theme.colors.foreground }]}>
            {confirmCopy}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (confirming) submit(confirming);
              }}
              disabled={anyBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Confirm"
              accessibilityState={{ busy, disabled: anyBusy }}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor:
                    confirming === "optOut"
                      ? theme.colors.destructive
                      : theme.colors.primary,
                },
                anyBusy && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primaryForeground}
                />
              ) : (
                <Text
                  style={[
                    styles.actionText,
                    { color: theme.colors.primaryForeground },
                  ]}
                >
                  Confirm
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirming(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.cancelText, { color: muted }]}>Back</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    lineHeight: 15,
  },
  disclosure: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  disclosureText: {
    fontSize: 11,
    fontWeight: "800",
  },
  panel: {
    marginTop: 8,
    width: "100%",
  },
  panelBody: {
    gap: 10,
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: "continuous",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderCurve: "continuous",
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  actionGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "800",
  },
  cancel: {
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
