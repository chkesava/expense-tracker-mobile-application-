/**
 * SPENDLY-798 (epic SPENDLY-793): the dashboard card listing every coming
 * auto-debit whose paying account falls short. It reads the server's stored
 * result (`useLowBalanceAlerts`) and is hidden when nothing is short. Each
 * row opens the recurring item or the card's bill, like the push.
 */

import { Text } from "react-native";
import { useRouter, type Href } from "expo-router";
import { AlertTriangle, CreditCard, Repeat } from "lucide-react-native";

import { DataRow, RowGlyph, Section } from "@/components/dashboard/primitives";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useLowBalanceAlerts } from "@/hooks/useLowBalanceAlerts";
import { lowBalanceDueLabel, lowBalanceItemLabel, lowBalanceUrl } from "@/shared/utils/lowBalanceDisplay";
import { useTheme } from "@/theme/ThemeProvider";

/** At most this many rows; the rest are counted in the subtitle. */
const MAX_ROWS = 4;

export function LowBalanceAlertCard() {
  const { theme } = useTheme();
  const router = useRouter();
  const money = useGhostMoney(useDisplayCurrency());
  const { view, today } = useLowBalanceAlerts();
  const { short } = view;
  if (!short.length) return null;

  const shown = short.slice(0, MAX_ROWS);
  const more = short.length - shown.length;

  return (
    <Section
      title="Low balance ahead"
      subtitle={`Add money before ${short.length === 1 ? "this is" : "these are"} debited${more > 0 ? ` (${more} more)` : ""}.`}
      icon={<AlertTriangle size={16} color={theme.colors.warning} strokeWidth={2.3} />}
      iconTint={theme.colors.warning}
      style={{ marginTop: 12 }}
      testID="low-balance-alert-card"
    >
      {shown.map((item, index) => {
        const Icon = item.kind === "card" ? CreditCard : Repeat;
        return (
          <DataRow
            key={`${item.kind}:${item.refId}:${item.billId ?? ""}:${item.dueDate}`}
            leading={
              <RowGlyph tint={theme.colors.warning}>
                <Icon size={16} color={theme.colors.warning} />
              </RowGlyph>
            }
            title={lowBalanceItemLabel(item)}
            meta={`${item.accountName} · due ${lowBalanceDueLabel(item.dueDate, today)} · ${money(item.amount)}`}
            value={<Text style={{ color: theme.colors.warning, fontFamily: theme.fontFamily.semibold }}>Short {money(item.shortBy)}</Text>}
            divider={index < shown.length - 1}
            onPress={() => router.push(lowBalanceUrl(item) as Href)}
            accessibilityLabel={`${lowBalanceItemLabel(item)}: ${item.accountName} is short by ${money(item.shortBy)}, due ${lowBalanceDueLabel(item.dueDate, today)}`}
          />
        );
      })}
    </Section>
  );
}
