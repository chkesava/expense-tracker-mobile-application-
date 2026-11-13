import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, CreditCard, Landmark, Scale, Users, Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { usePageListBottomPadding } from "@/components/layout/usePageListBottomPadding";
import { useContentWidthStyle } from "@/hooks/useResponsiveLayout";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { haptic } from "@/lib/haptics";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

interface LiabilityRow {
  key: string;
  label: string;
  caption: string;
  value: number;
  icon: typeof CreditCard;
  route: Href;
}

/**
 * The "Total Liabilities" figure, broken down by where it comes from — tap
 * through to each component's own existing screen (credit card bills,
 * accounts, borrowings, group funds). Every figure is a field of the one
 * `useUnifiedNetWorth` summary the dashboard already reads; nothing here
 * recomputes a total.
 */
export default function LiabilitiesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const currency = useDisplayCurrency();
  const contentWidthStyle = useContentWidthStyle("wide");
  const listPaddingBottom = usePageListBottomPadding();
  const netWorth = useUnifiedNetWorth();

  const back = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));

  const rows: LiabilityRow[] = [
    {
      key: "cards",
      label: "Credit Cards",
      caption: "Unpaid statements and new charges",
      value: netWorth.creditCardLiabilities,
      icon: CreditCard,
      route: "/ledger?tab=ccBills" as Href,
    },
    {
      key: "overdraft",
      label: "Bank Overdrafts",
      caption: "Accounts you've gone negative on",
      value: netWorth.bankOverdraftLiabilities,
      icon: Landmark,
      route: "/ledger?tab=accounts" as Href,
    },
    {
      key: "loans",
      label: "Loans & Borrowings",
      caption: "Principal plus accrued interest",
      value: netWorth.borrowingLiabilities,
      icon: Wallet,
      route: "/ledger?tab=borrowings" as Href,
    },
    {
      key: "groupFunds",
      label: "Group Funds Held",
      caption: netWorth.groupFundsHeldUnknown
        ? "Couldn't load — may be understated"
        : "Money you're holding for others",
      value: netWorth.groupFundLiabilities,
      icon: Users,
      route: "/ledger?tab=groupFunds" as Href,
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }, contentWidthStyle]}>
      <PageHeader
        title="Total Liabilities"
        subtitle="What you owe, by source"
        icon={<Scale size={18} color={theme.colors.destructive} />}
        onBack={back}
      />

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.content, { paddingBottom: listPaddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.totalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
            Total owed
          </Text>
          {netWorth.loading ? (
            <Skeleton width={160} height={34} borderRadius={8} />
          ) : (
            <Amount
              value={Math.round(netWorth.totalLiabilities)}
              currency={currency}
              fractionDigits={0}
              ghostable
              numberOfLines={1}
              style={{ fontSize: 32, letterSpacing: -0.6, fontFamily: theme.fontFamily.bold, color: theme.colors.destructive }}
            />
          )}
        </View>

        <View style={styles.rows}>
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <Pressable
                key={row.key}
                onPress={() => {
                  void haptic.selection();
                  router.push(row.route);
                }}
                android_ripple={{ color: surfaces.control, borderless: false }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.row,
                  { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
                  (pressed || hovered) && { opacity: 0.9 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${row.label}`}
              >
                <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.destructive) }]}>
                  <Icon size={18} color={theme.colors.destructive} strokeWidth={2.2} />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={[styles.rowLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
                    {row.label}
                  </Text>
                  <Text
                    style={[styles.rowCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
                    numberOfLines={1}
                  >
                    {row.caption}
                  </Text>
                </View>
                {netWorth.loading ? (
                  <Skeleton width={80} height={20} borderRadius={5} />
                ) : (
                  <Amount
                    value={Math.round(row.value)}
                    currency={currency}
                    fractionDigits={0}
                    ghostable
                    numberOfLines={1}
                    style={{
                      fontSize: 15,
                      fontFamily: theme.fontFamily.semibold,
                      color: row.value > 0 ? theme.colors.destructive : theme.colors.mutedForeground,
                    }}
                  />
                )}
                <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
              </Pressable>
            );
          })}
        </View>

        {netWorth.untrustedBalanceAccounts > 0 ? (
          <Text
            style={[
              styles.note,
              { color: theme.colors.warning, fontFamily: theme.fontFamily.regular, backgroundColor: withAlpha(theme.colors.warning, 0.1) },
            ]}
          >
            {netWorth.untrustedBalanceAccountNames.length > 0
              ? `${netWorth.untrustedBalanceAccountNames.join(", ")} need${netWorth.untrustedBalanceAccountNames.length === 1 ? "s" : ""} a balance rebuild — these figures may be incomplete.`
              : "Some account balances need a rebuild — these figures may be incomplete."}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  totalCard: {
    padding: 20,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 6,
  },
  totalLabel: {
    fontSize: 13,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14.5,
  },
  rowCaption: {
    fontSize: 12,
  },
  note: {
    fontSize: 12.5,
    lineHeight: 17,
    padding: 12,
    borderRadius: 12,
  },
});
