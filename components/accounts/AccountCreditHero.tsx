import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MAX_UNBILLED_PERCENT } from "@/shared/utils/creditCardLedger";
import { Calendar, CheckCircle2 } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces, withAlpha } from "@/theme/surfaces";

export function AccountCreditHero({
  usedThisCycle,
  statementDue,
  cancelledSpend = 0,
  cashbackThisCycle = 0,
  totalOutstanding,
  availableCredit,
  creditLimit,
  daysRemaining,
  openCycleStart,
  nextResetDate,
  billDayConfigured = true,
  currency,
  payLabel,
  onPay,
  onSetLimit,
  isLoading,
}: {
  /** Unbilled spend in the open cycle — resets when a statement is cut. */
  usedThisCycle: number;
  /** Still owed on closed statements. */
  statementDue: number;
  /** Owed under a cancelled statement — not this cycle, so it never eats the limit. */
  cancelledSpend?: number;
  /** Provider cashback credited this cycle. Explains a balance that fell on its own. */
  cashbackThisCycle?: number;
  totalOutstanding: number;
  availableCredit: number;
  creditLimit: number;
  daysRemaining: number;
  openCycleStart?: string;
  nextResetDate?: string;
  /** False when the card has no bill date set — there is no real cycle to show. */
  billDayConfigured?: boolean;
  currency: string;
  payLabel: string;
  onPay: () => void;
  onSetLimit?: () => void;
  isLoading?: boolean;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  // SPENDLY-537: theme tokens on the deep-hero surface, replacing the fixed
  // indigo/gold palette. The accent is the user's theme accent.
  const accent = theme.colors.primary;
  const utilizationRate =
    creditLimit > 0 ? Math.min(100, (usedThisCycle / creditLimit) * 100) : 0;
  const usedColor = theme.colors.destructive;
  const availableColor = theme.colors.success;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: withAlpha(accent, surfaces.isDark ? 0.22 : 0.18),
          backgroundColor: theme.colors.card,
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          [withAlpha(accent, surfaces.isDark ? 0.14 : 0.08), withAlpha(accent, 0), theme.colors.card]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          { backgroundColor: withAlpha(accent, surfaces.isDark ? 0.16 : 0.1) },
        ]}
      />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text
            style={[styles.kicker, { color: theme.colors.mutedForeground }]}
            numberOfLines={1}
          >
            UNBILLED (THIS CYCLE)
          </Text>
          {!isLoading && usedThisCycle > creditLimit * MAX_UNBILLED_PERCENT && (
            <View style={[styles.warningBadge, { backgroundColor: surfaces.wash(theme.colors.warning) }]}>
              <Text style={[styles.warningText, { color: theme.colors.warning }]}>⚠️ Near limit</Text>
            </View>
          )}
          {!isLoading && (
            <Pressable
              disabled={billDayConfigured || !onSetLimit}
              onPress={() => onSetLimit?.()}
              style={[
                styles.resetPill,
                {
                  backgroundColor: surfaces.control,
                },
              ]}
            >
              <Calendar size={12} color={theme.colors.mutedForeground} />
              <Text style={[styles.resetText, { color: theme.colors.mutedForeground }]}>
                {billDayConfigured ? `Resets in ${daysRemaining}d` : "Set bill date"}
              </Text>
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <View style={{ height: 40, width: 140, backgroundColor: surfaces.track, borderRadius: 8, marginVertical: 4 }} />
        ) : (
          <Amount
            value={usedThisCycle}
            currency={currency}
            ghostable
            // Red only when something is actually owed this cycle.
            style={[styles.heroAmount, { color: usedThisCycle > 0 ? usedColor : theme.colors.foreground }]}
          />
        )}

        <View style={styles.dueRow}>
          <Text style={[styles.dueLabel, { color: theme.colors.mutedForeground }]}>
            Statement due
          </Text>
          <Amount
            value={statementDue}
            currency={currency}
            ghostable
            style={[
              styles.dueValue,
              { color: statementDue > 0 ? usedColor : theme.colors.foreground },
            ]}
          />
        </View>
        {cancelledSpend > 0 ? (
          <View style={styles.dueRow}>
            <Text style={[styles.dueLabel, { color: theme.colors.mutedForeground }]}>
              Cancelled statements
            </Text>
            <Amount
              value={cancelledSpend}
              currency={currency}
              ghostable
              style={[styles.dueValue, { color: usedColor }]}
            />
          </View>
        ) : null}
        {cashbackThisCycle > 0 ? (
          <View style={styles.dueRow}>
            <Text style={[styles.dueLabel, { color: theme.colors.mutedForeground }]}>
              Cashback this cycle
            </Text>
            <Amount
              value={cashbackThisCycle}
              currency={currency}
              ghostable
              style={[styles.dueValue, { color: availableColor }]}
            />
          </View>
        ) : null}
        <View style={styles.dueRow}>
          <Text style={[styles.dueLabel, { color: theme.colors.mutedForeground }]}>
            Total outstanding
          </Text>
          <Amount
            value={totalOutstanding}
            currency={currency}
            ghostable
            style={[styles.dueValue, { color: theme.colors.foreground }]}
          />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.mutedForeground }}>
            {openCycleStart && nextResetDate
              ? `Cycle: ${openCycleStart.slice(5, 10).replace("-", "/")} — ${nextResetDate.slice(5, 10).replace("-", "/")}`
              : billDayConfigured
                ? "Current cycle"
                : "No bill date set"}
          </Text>
          {creditLimit > 0 && (
            <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.foreground, fontVariant: ["tabular-nums"] }}>
              {Math.round(utilizationRate)}% used
            </Text>
          )}
        </View>

        {creditLimit > 0 ? (
          <View
            style={[
              styles.track,
              { backgroundColor: surfaces.track },
            ]}
            accessibilityLabel={`${Math.round(utilizationRate)} percent of credit limit used`}
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${utilizationRate}%`,
                  backgroundColor: usedColor,
                },
              ]}
            />
          </View>
        ) : (
          <Pressable onPress={() => onSetLimit?.()} style={{ paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, color: theme.colors.primary, fontWeight: "600" }}>
              + Set credit limit to track utilization
            </Text>
          </Pressable>
        )}

        <View style={styles.metrics}>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              Available Credit
            </Text>
            <Amount
              value={availableCredit}
              currency={currency}
              ghostable
              style={[styles.metricValue, { color: availableColor }]}
            />
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: surfaces.divider },
            ]}
          />
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
              Credit Limit
            </Text>
            <Amount
              value={creditLimit}
              currency={currency}
              ghostable
              style={[styles.metricValue, { color: theme.colors.foreground }]}
            />
          </View>
        </View>

        <Button
          variant="outline"
          size="sm"
          haptic={false}
          onPress={() => {
            void haptic.impact();
            onPay();
          }}
          accessibilityLabel={payLabel}
          style={[styles.cta, { backgroundColor: accent, borderColor: accent }]}
        >
          <CheckCircle2 size={18} color={theme.colors.primaryForeground} strokeWidth={2.4} />
          <Text style={[styles.ctaLabel, { color: theme.colors.primaryForeground }]}>{payLabel}</Text>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    right: -36,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  body: {
    padding: 18,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: "700",
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
  },
  resetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexShrink: 0,
  },
  resetText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dueLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  dueValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  metricCol: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  warningBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  warningText: {
    fontSize: 10,
    fontWeight: '600',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    alignSelf: "stretch",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    borderRadius: 16,
    borderCurve: "continuous",
    gap: 8,
  },
  ctaLabel: {
    fontWeight: "800",
    fontSize: 15,
  },
  pressed: {
    opacity: 0.86,
  },
});
