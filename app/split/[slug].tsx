import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { Amount } from "@/components/common/Amount";
import { ErrorState } from "@/components/common/ErrorState";
import { PublicSplitClaimRow } from "@/components/splits/PublicSplitClaimRow";
import { usePublicSplitClaimActions } from "@/hooks/usePublicSplitClaimActions";
import { usePublicSplitShare } from "@/hooks/usePublicSplitShare";
import { useSplitShareClaims } from "@/hooks/useSplitShareClaims";
import { mergePendingClaims } from "@/shared/utils/splitClaims";
import {
  publicParticipantStatusLabel,
  publicShareCurrency,
} from "@/shared/utils/splitPublicShare";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function PublicSplitScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const { share, loading, error, retry } = usePublicSplitShare(slug);
  const { push } = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  // Never read system settings here: `system_settings/global` requires
  // sign-in, so an anonymous visitor's read always fails and every share
  // would silently render as INR.
  const currency = publicShareCurrency(share);

  const claimKeys = useMemo(() => share?.claimKeys || [], [share?.claimKeys]);
  const { claims } = useSplitShareClaims(share?.id, claimKeys, {
    enabled: share?.claimsEnabled === true,
  });
  const { submitting, submitClaim } = usePublicSplitClaimActions(share);
  const rows = useMemo(
    () => (share ? mergePendingClaims(share, claims) : []),
    [share, claims]
  );

  const statusLabel = share?.status ? share.status.toUpperCase() : "";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={[styles.kicker, { color: theme.colors.mutedForeground }]}>
        SHARED SPLIT
      </Text>

      {loading ? (
        <Text style={{ color: theme.colors.mutedForeground }}>Loading…</Text>
      ) : error || !share ? (
        <ErrorState
          title="Can't open this split"
          description={error?.message || "Split not found."}
          onRetry={error?.retryable ? retry : undefined}
        />
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {statusLabel ? (
            <Text
              style={[
                styles.status,
                {
                  color:
                    statusLabel === "SETTLED" || statusLabel === "SPENT"
                      ? "#22C55E"
                      : theme.colors.primary,
                },
              ]}
            >
              {statusLabel}
            </Text>
          ) : null}

          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            {share.title}
          </Text>
          <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
            Organized by {share.organizerName}
          </Text>
          <Amount
            value={share.totalAmount}
            currency={currency}
            ghostable
            style={{
              fontSize: 32,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />

          <View style={styles.people}>
            {rows.map((p, index) => {
              const rowKey = `${p.name}-${index}`;
              const canPay =
                !p.optedOut &&
                !p.isOrganizer &&
                Boolean(p.personSlug) &&
                p.remainingDue > 0.009;
              return (
                <View
                  key={rowKey}
                  style={[
                    styles.personRow,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.03)",
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.personTop}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        styles.personName,
                        {
                          color: theme.colors.foreground,
                          textDecorationLine: p.optedOut ? "line-through" : "none",
                          opacity: p.optedOut ? 0.7 : 1,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {p.name}
                      {p.isOrganizer ? " · organizer" : ""}
                    </Text>
                    <Text
                      style={[
                        styles.personMeta,
                        {
                          color:
                            !p.optedOut && p.remainingDue <= 0.009
                              ? "#22C55E"
                              : p.shareRaised && !p.optedOut
                                ? theme.colors.primary
                                : theme.colors.mutedForeground,
                        },
                      ]}
                    >
                      {publicParticipantStatusLabel(p, {
                        optedOutNames: share.optedOutNames,
                        currency,
                      })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <Amount
                      value={p.optedOut ? p.paidAmount : p.remainingDue > 0.009 ? p.remainingDue : p.amount}
                      currency={currency}
                      ghostable
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: theme.colors.foreground,
                      }}
                    />
                    {canPay ? (
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => undefined);
                          push(`/payment/${p.personSlug}` as never);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Pay ${p.name}`}
                        style={({ pressed }) => [
                          styles.payBtn,
                          { backgroundColor: theme.colors.primary },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.primaryForeground,
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          Pay
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  </View>
                  {p.isOrganizer ? null : (
                    <PublicSplitClaimRow
                      row={p}
                      share={share}
                      currency={currency}
                      submitting={submitting}
                      onSubmit={(params) =>
                        submitClaim({
                          ...params,
                          existing:
                            claims.find(
                              (c) => c.participantKey === params.participantKey
                            ) || null,
                        })
                      }
                    />
                  )}
                  {!p.optedOut && !p.personSlug && p.remainingDue > 0.009 ? (
                    <Text
                      style={[
                        styles.personMeta,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Ask {share.organizerName} for a pay link.
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      )}

      <Text
        style={[
          styles.footer,
          { color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" },
        ]}
      >
        {share?.claimsEnabled === true
          ? "No app account needed. Pay via UPI, or tell the organizer you’ve paid."
          : share?.claimsEnabled === false
            ? "No app account needed. The organizer has turned off updates for this link."
            : "No app account needed. Pay via UPI on each person’s page."}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
  },
  kicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 24,
    gap: 10,
  },
  status: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  meta: {
    fontSize: 13,
  },
  people: {
    marginTop: 8,
    gap: 8,
  },
  personRow: {
    padding: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 4,
  },
  personTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  personName: {
    fontSize: 14,
    fontWeight: "700",
  },
  personMeta: {
    fontSize: 11,
  },
  payBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  footer: {
    fontSize: 12,
    textAlign: "center",
  },
});
