/**
 * The organizer's inbox for updates filed from the public share link.
 *
 * Sits above the participant list because it needs attention before the list
 * makes sense: a pending "I've paid" changes what the list should say.
 *
 * Applying routes back into the existing write paths rather than inventing new
 * ones — a collect claim opens the account picker already on that participant's
 * row, and an opt-out reuses the existing "Drop & recalculate" confirmation.
 * That keeps the money-affecting code in one place.
 */

import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import type { Split } from "@/shared/types/split";
import type { SplitShareClaim } from "@/shared/types/splitShareClaim";
import {
  claimApplyPlan,
  describeClaimForOrganizer,
} from "@/shared/utils/splitClaims";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type SplitClaimsSectionProps = {
  split: Split;
  claims: SplitShareClaim[];
  currency: string;
  /** Participant key currently being applied or dismissed. */
  workingKey: string | null;
  onApply: (claim: SplitShareClaim) => void;
  onDismiss: (claim: SplitShareClaim) => void;
  onToggleClaims: (enabled: boolean) => void;
  /** Mirrors `splitPublicShares.claimsEnabled`; undefined on legacy shares. */
  claimsEnabled: boolean;
  togglePending: boolean;
};

export function SplitClaimsSection({
  split,
  claims,
  currency,
  workingKey,
  onApply,
  onDismiss,
  onToggleClaims,
  claimsEnabled,
  togglePending,
}: SplitClaimsSectionProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const muted = theme.colors.mutedForeground;

  const hasClaims = claims.length > 0;
  // Nothing to show at all on a split that was never shared.
  if (!split.publicShareId) return null;

  return (
    <View style={styles.wrap}>
      {hasClaims ? (
        <>
          <Text style={[styles.heading, { color: muted }]}>
            UPDATES FROM THE SHARE LINK ({claims.length})
          </Text>
          {claims.map((claim) => {
            const described = describeClaimForOrganizer(claim, split, currency);
            const plan = claimApplyPlan(split, claim);
            const busy = workingKey === claim.participantKey;
            return (
              <View
                key={claim.participantKey}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.03)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.headline, { color: theme.colors.foreground }]}
                  numberOfLines={2}
                >
                  {described.headline}
                </Text>
                <Text style={[styles.detail, { color: muted }]}>
                  {plan.action === "dismiss" ? plan.reason : described.detail}
                </Text>
                <View style={styles.actions}>
                  {plan.action === "dismiss" ? null : (
                    <Pressable
                      onPress={() => onApply(claim)}
                      disabled={busy}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Apply update from ${described.name}`}
                      accessibilityState={{ busy, disabled: busy }}
                      style={({ pressed }) => [
                        styles.action,
                        {
                          backgroundColor: described.destructive
                            ? theme.colors.destructive
                            : theme.colors.primary,
                        },
                        busy && { opacity: 0.5 },
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
                          Apply
                        </Text>
                      )}
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => onDismiss(claim)}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Dismiss update from ${described.name}`}
                    accessibilityState={{ disabled: busy }}
                    style={({ pressed }) => [
                      styles.action,
                      styles.actionGhost,
                      { borderColor: theme.colors.border },
                      busy && { opacity: 0.5 },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: muted }]}>
                      Dismiss
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </>
      ) : null}

      <View style={styles.toggleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.toggleLabel, { color: theme.colors.foreground }]}>
            Allow updates from the share link
          </Text>
          <Text style={[styles.toggleHelp, { color: muted }]}>
            {claimsEnabled
              ? "People with the link can tell you they've paid or won't contribute. You still confirm each one."
              : "The link is read-only. People can still see the split and pay by UPI."}
          </Text>
        </View>
        <Switch
          value={claimsEnabled}
          onValueChange={onToggleClaims}
          disabled={togglePending}
          accessibilityLabel="Allow updates from the share link"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 4,
  },
  heading: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  card: {
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  headline: {
    fontSize: 14,
    fontWeight: "700",
  },
  detail: {
    fontSize: 11,
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  toggleHelp: {
    fontSize: 11,
    lineHeight: 15,
  },
});
