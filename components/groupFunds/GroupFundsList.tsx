import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Plus, Users } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { HeroSection, MetaLabel } from "@/components/dashboard/primitives";
import { GroupFundFormSheet } from "@/components/groupFunds/GroupFundFormSheet";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGroupFundActions } from "@/hooks/useGroupFundActions";
import { useGroupFunds } from "@/hooks/useGroupFunds";
import type { GroupFund } from "@/shared/types/groupFund";
import { totalGroupFundsHeld } from "@/shared/utils/groupFundMath";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The Money hub's Group Funds section (SPENDLY-687): money the user collects
 * and holds for others (a Dokra pool, a committee kitty). One listener on
 * `groupFunds` (no events are read here); every amount is a fund's stored
 * total.
 */
export function GroupFundsList() {
  const { theme } = useTheme();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { funds, loading, error, retry } = useGroupFunds();
  const actions = useGroupFundActions();
  const [creating, setCreating] = useState(false);
  const [newFundId, setNewFundId] = useState("");

  const openCreate = () => {
    // One id per create: a retry after a failure writes the same fund.
    setNewFundId(actions.newFundId());
    setCreating(true);
  };
  const open = (fund: GroupFund) => router.push(`/group-funds/${fund.id}` as Href);
  // Every fund, archived ones too: money still held is still not yours (as in net worth).
  const held = totalGroupFundsHeld(funds);
  const muted = { color: theme.colors.mutedForeground };

  let body;
  if (error) {
    body = <ErrorState title="Couldn't load your group funds" description={error.message} onRetry={error.retryable ? retry : undefined} />;
  } else if (loading) {
    body = (
      <View style={styles.list}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (funds.length === 0) {
    body = (
      <EmptyState
        illustration="general"
        title="No group funds yet"
        description="Track money you collect for a group, like a Dokra or a committee, and what you pay out. It stays in your account balances but out of your net worth, income and spending."
        primaryAction={{
          label: "Create a group fund",
          icon: <Plus size={16} color={theme.colors.primaryForeground} strokeWidth={2.4} />,
          onPress: openCreate,
        }}
      />
    );
  } else {
    body = (
      <View style={styles.list}>
        {funds.map((fund) => {
          const purposes = fund.purposes.filter((p) => !p.archived);
          const members = fund.members.filter((m) => !m.archived).length;
          return (
            <Pressable
              key={fund.id}
              onPress={() => open(fund)}
              accessibilityRole="button"
              accessibilityLabel={`${fund.name}, holds ${money(fund.totals.held)}. Open`}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.colors.card, borderColor: theme.colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.flex}>
                  <Text style={[styles.cardTitle, { color: theme.colors.foreground }]} numberOfLines={1}>
                    {fund.name}
                  </Text>
                  <Text style={[styles.cardMeta, muted]} numberOfLines={1}>
                    {[`${members} member${members === 1 ? "" : "s"}`, purposes.map((p) => p.name).join(", ")].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {fund.status === "archived" ? <Chip label="Archived" size="sm" /> : null}
                <ChevronRight size={18} color={theme.colors.mutedForeground} />
              </View>
              <MetaLabel>Held</MetaLabel>
              <FinancialAmount value={fund.totals.held} currency={currency} size="lg" weight="bold" />
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {funds.length > 0 ? (
        <HeroSection
          variant="deep"
          title="Held for others"
          subtitle="Inside your bank and cash balances, but not yours"
          icon={<Users size={16} color={theme.colors.primary} strokeWidth={2.3} />}
        >
          <MetaLabel>Group funds held</MetaLabel>
          <FinancialAmount value={held} currency={currency} size="hero" weight="bold" />
          <Text style={[styles.note, muted]}>
            Your account balances include it. Your net worth, income, spending and budgets don't.
          </Text>
        </HeroSection>
      ) : null}

      {funds.length > 0 ? (
        <Button onPress={openCreate} variant="outline">
          <Plus size={16} color={theme.colors.foreground} />
          <Text style={{ fontWeight: "700", color: theme.colors.foreground }}>New group fund</Text>
        </Button>
      ) : null}

      {body}

      <GroupFundFormSheet
        visible={creating}
        newKey={actions.newKey}
        onClose={() => setCreating(false)}
        onSubmit={async (input) => {
          const ok = await actions.createFund(newFundId, input);
          if (ok) router.push(`/group-funds/${newFundId}` as Href);
          return ok;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  list: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, borderCurve: "continuous", padding: 14, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardMeta: { fontSize: 12, marginTop: 2 },
  note: { fontSize: 12, marginTop: 8 },
  flex: { flex: 1 },
});
