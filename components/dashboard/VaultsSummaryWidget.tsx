import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Shield } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { Card } from "@/components/ui/Card";
import { useSurfaces } from "@/components/dashboard/primitives";
import { useVaults } from "@/hooks/useVaults";
import { haptic } from "@/lib/haptics";
import { totalVaultBudgets } from "@/shared/utils/vaultMath";
import { useTheme } from "@/theme/ThemeProvider";

export interface VaultsSummaryWidgetProps {
  currency: string;
  fill?: boolean;
}

/**
 * Vault count and total budgeted, from the one `useVaults()` listener. A true
 * cross-vault savings balance needs every vault's own deposits/withdrawals,
 * which only has a per-vault listener — see `totalVaultBudgets`'s doc comment
 * for why this card shows "Budgeted" rather than a fabricated balance.
 */
export const VaultsSummaryWidget = memo(function VaultsSummaryWidget({ currency, fill = false }: VaultsSummaryWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { vaults, loading } = useVaults();
  const { totalBudget, vaultCount } = useMemo(() => totalVaultBudgets(vaults), [vaults]);

  const openVaults = () => {
    void haptic.selection();
    router.push("/vaults" as Href);
  };

  return (
    <Pressable onPress={openVaults} accessibilityRole="link" accessibilityHint="Opens vaults">
      <Card variant="outlined" style={fill ? styles.fill : undefined} contentStyle={styles.content} testID="dash-vaults-summary">
        <View style={styles.header}>
          <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
            <Shield size={16} color={theme.colors.primary} strokeWidth={2.3} />
          </View>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            Vaults
          </Text>
          <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
        </View>

        {loading ? (
          <Skeleton width="60%" height={26} borderRadius={6} />
        ) : vaultCount === 0 ? (
          <EmptyState title="No vaults yet" description="Create a shared vault to track a group budget together." compact />
        ) : (
          <>
            <Amount
              value={Math.round(totalBudget)}
              currency={currency}
              fractionDigits={0}
              ghostable
              numberOfLines={1}
              style={{ fontSize: 24, fontFamily: theme.fontFamily.bold, color: theme.colors.foreground }}
            />
            <Text style={[styles.caption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              Budgeted across {vaultCount} vault{vaultCount === 1 ? "" : "s"}
            </Text>
          </>
        )}
      </Card>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: {
    gap: 8,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 15,
  },
  caption: {
    fontSize: 12.5,
  },
});
