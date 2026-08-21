import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { Amount } from "@/components/common/Amount";
import { usePublicSplitShare } from "@/hooks/usePublicSplitShare";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export default function PublicSplitScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const { share, loading, error } = usePublicSplitShare(slug);
  const { push } = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const { settings: system } = useSystemSettings();
  const currency = share?.currency || system.defaultCurrency;

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
        <Text style={{ color: theme.colors.destructive, fontWeight: "600" }}>
          {error || "Split not found."}
        </Text>
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
            {share.participants.map((p, index) => {
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
                    {p.optedOut ? (
                      <Text style={[styles.personMeta, { color: theme.colors.mutedForeground }]}>
                        Won’t contribute
                      </Text>
                    ) : p.remainingDue <= 0.009 ? (
                      <Text style={[styles.personMeta, { color: "#22C55E" }]}>
                        Paid
                      </Text>
                    ) : p.paidAmount > 0.009 ? (
                      <Text style={[styles.personMeta, { color: theme.colors.mutedForeground }]}>
                        Paid part · remaining due
                      </Text>
                    ) : (
                      <Text style={[styles.personMeta, { color: theme.colors.mutedForeground }]}>
                        Unpaid
                      </Text>
                    )}
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
        No app account needed. Pay via UPI on each person’s page.
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
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
