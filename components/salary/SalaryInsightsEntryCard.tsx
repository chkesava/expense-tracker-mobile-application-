import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Banknote } from "lucide-react-native";

import { useSalaryIntelligenceData } from "@/hooks/useSalaryIntelligenceData";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import { ordinal } from "@/shared/features/salary";

/**
 * Entry card for Salary Intelligence placed on the Insights screen (SPENDLY-334).
 * Summarizes current regular net pay, next expected payday, or pending reviews.
 */
export function SalaryInsightsEntryCard() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);

  const {
    records,
    latestRegularRecord,
    pendingCandidates,
    forecast,
    loading,
    error,
  } = useSalaryIntelligenceData();

  const toReview = pendingCandidates.length;
  const netAmount = latestRegularRecord?.netAmount ?? 0;
  const employer = latestRegularRecord?.employer?.name || "Salary";
  const nextPayday = forecast?.nextExpectedPaycheck?.expectedDate;

  const subtitle = error
    ? "Couldn't load salary data — tap to view"
    : loading
    ? "Checking salary history…"
    : toReview > 0
    ? `${toReview} salary ${toReview === 1 ? "deposit" : "deposits"} to review`
    : netAmount > 0
    ? `${employer} · ${money(netAmount)}/mo${nextPayday ? ` · Next ${ordinal(Number(nextPayday.slice(8, 10)))}` : ""}`
    : "Track net salary, deductions, stability and payday timeline";

  return (
    <Pressable
      onPress={() => router.push("/salary" as never)}
      accessibilityRole="button"
      accessibilityLabel={`Salary Intelligence. ${subtitle}`}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: theme.colors.border,
          backgroundColor: pressed ? surfaces.tile : theme.colors.card,
          borderRadius: theme.radius.lg,
          padding: theme.space.lg,
          gap: theme.space.md,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
        <Banknote size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }]}>
          Salary Intelligence
        </Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }]}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {},
  subtitle: {},
});
