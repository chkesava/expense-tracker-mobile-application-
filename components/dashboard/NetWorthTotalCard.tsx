import { memo } from "react";
import { CreditCard, Layers } from "lucide-react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { totalChangeTone, type TotalChange, type TotalKind } from "@/shared/utils/dashboardDesktop";

const LABELS: Record<TotalKind, string> = {
  assets: "Total Assets",
  liabilities: "Total Liabilities",
};

const ICONS: Record<TotalKind, typeof Layers> = {
  assets: Layers,
  liabilities: CreditCard,
};

/**
 * SPENDLY-718 — Total Assets / Total Liabilities beside the desktop net-worth
 * hero. A thin `KpiCard` wrapper (SPENDLY dashboard redesign) keyed to
 * `TotalKind`, kept under its original name/signature so existing call sites
 * are unaffected. The figure is the `useUnifiedNetWorth` total; the change is
 * the same total between the hero's two stored snapshots (`totalChange`), so
 * both cards and the hero always describe one period. Ghost mode hides the
 * figure and the change. The card opens the accounts list, as the Money hub's
 * hero does.
 */
export const NetWorthTotalCard = memo(function NetWorthTotalCard({
  kind,
  value,
  currency,
  change,
  when,
  loading = false,
  onPress,
  style,
}: {
  kind: TotalKind;
  value: number;
  currency: string;
  change: TotalChange;
  when: string;
  loading?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KpiCard
      icon={ICONS[kind]}
      label={LABELS[kind]}
      value={value}
      currency={currency}
      change={change}
      changeTone={totalChangeTone(kind, change.change)}
      when={when}
      loading={loading}
      onPress={onPress}
      style={style}
      testID={`dash-total-${kind}`}
    />
  );
});
