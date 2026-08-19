import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Landmark, Repeat, Wallet } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  DataRow,
  MetaLabel,
  RowGlyph,
  Section,
  SectionAction,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import type { Subscription } from "@/shared/types/subscription";
import { computeMonthlyCommitments, getNextRenewalDate } from "@/shared/utils/subscriptionProcessor";
import { useTheme } from "@/theme/ThemeProvider";

export interface SubscriptionsWidgetProps {
  currency: string;
}

const PREVIEW_LIMIT = 4;

const TYPE_ICONS: Record<Subscription["type"], typeof Repeat> = {
  subscription: Repeat,
  emi: Landmark,
  transfer: Wallet,
};

function dueLabel(days: number): string {
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function SubscriptionsWidget({ currency }: SubscriptionsWidgetProps) {
  const { push } = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { subscriptions } = useSubscriptions();

  const commitments = useMemo(() => {
    return computeMonthlyCommitments(subscriptions);
  }, [subscriptions]);

  /** Soonest-due first so the list answers "what's next?". */
  const preview = useMemo(() => {
    return subscriptions
      .filter((sub) => sub.isActive && !sub.isCompleted)
      .map((sub) => ({ sub, days: getNextRenewalDate(sub).daysRemaining }))
      .sort((a, b) => a.days - b.days)
      .slice(0, PREVIEW_LIMIT);
  }, [subscriptions]);

  const openSubscriptions = () => push("/ledger?tab=subscriptions");

  return (
    <Section
      title="Recurring Payments"
      subtitle={`${commitments.activeCount} active · ${currency} ${commitments.totalMonthly.toLocaleString()} / mo`}
      icon={<Repeat size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={<SectionAction label="Manage" onPress={openSubscriptions} />}
    >
      {preview.length > 0 ? (
        <View>
          {preview.map(({ sub, days }, idx) => {
            const Icon = TYPE_ICONS[sub.type] ?? Repeat;
            const isImminent = days <= 3;
            return (
              <DataRow
                key={sub.id || sub.name}
                onPress={openSubscriptions}
                divider={idx < preview.length - 1}
                leading={
                  <RowGlyph size={34} tint={surfaces.tile}>
                    <Icon
                      size={15}
                      color={theme.colors.mutedForeground}
                      strokeWidth={2.2}
                    />
                  </RowGlyph>
                }
                title={sub.name}
                value={
                  <Amount
                    value={sub.amount}
                    currency={currency}
                    ghostable
                    style={{
                      fontSize: 14.5,
                      fontFamily: theme.fontFamily.semibold,
                      color: theme.colors.foreground,
                    }}
                  />
                }
                valueMeta={
                  <Text
                    style={[
                      styles.due,
                      {
                        color: isImminent
                          ? theme.colors.warning
                          : theme.colors.mutedForeground,
                        fontFamily: theme.fontFamily.medium,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {dueLabel(days)}
                  </Text>
                }
                accessibilityLabel={`${sub.name}, ${dueLabel(days)}`}
              />
            );
          })}
        </View>
      ) : (
        <MetaLabel numberOfLines={2}>
          Repeating merchants like Netflix will show up here.
        </MetaLabel>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  due: {
    fontSize: 11,
    lineHeight: 15,
  },
});
