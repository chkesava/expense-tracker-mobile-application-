import { type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import {
  AssetIcon,
  CollectionIcon,
  ContributionIcon,
  ExpenseIcon,
  MemberPaymentIcon,
  OpeningFundIcon,
  SevaIcon,
  VolunteerIcon,
} from "@/components/ganesh/art/icons";
import { useArtScale } from "@/components/ganesh/art/useArtScale";
import { Section, GANESH_RADIUS } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { haptic } from "@/lib/haptics";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

type QuickAction = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  permission?: GaneshPermission;
};

const ACTIONS: QuickAction[] = [
  { href: "/(ganesh)/add-seva", label: "Seva", Icon: SevaIcon, permission: "seva.write" },
  { href: "/(ganesh)/add-collection", label: "Collection", Icon: CollectionIcon, permission: "collections.create" },
  { href: "/(ganesh)/add-expense", label: "Expense", Icon: ExpenseIcon, permission: "expenses.create" },
  {
    href: "/(ganesh)/add-contribution",
    label: "Contribution",
    Icon: ContributionIcon,
    permission: "contributions.create",
  },
  { href: "/(ganesh)/(tabs)/people", label: "Volunteer", Icon: VolunteerIcon, permission: "members.read" },
  { href: "/(ganesh)/add-asset", label: "Asset / Item", Icon: AssetIcon, permission: "assets.create" },
  {
    href: "/(ganesh)/add-member-payment",
    label: "Member Payment",
    Icon: MemberPaymentIcon,
    permission: "contributions.create",
  },
  {
    href: "/(ganesh)/add-opening-fund",
    label: "Opening Fund",
    Icon: OpeningFundIcon,
    permission: "openingFunds.create",
  },
];

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

/**
 * Pandal operations — existing write (and People) destinations, filtered by
 * the permission that already governs each one. No invented flows.
 */
export function GaneshQuickActions({ disabled }: { disabled?: boolean }) {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { can } = useGaneshPermissions();
  const g = useGaneshTokens();
  const { actionIcon } = useArtScale();

  const items = ACTIONS.filter((action) => !action.permission || can(action.permission));
  if (items.length === 0) return null;

  return (
    <Section title="Quick Actions" plain>
      <View style={styles.grid}>
        {chunkRows(items, 4).map((row) => (
          <View key={row.map((item) => item.href).join("|")} style={styles.row}>
            {row.map(({ href, label, Icon }) => (
              <Pressable
                key={href}
                disabled={disabled}
                onPress={() => {
                  void haptic.selection();
                  push(href as never);
                }}
                accessibilityRole="button"
                accessibilityLabel={label}
                android_ripple={{ color: g.ripple, borderless: false }}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: g.divider,
                  },
                  disabled ? { opacity: 0.45 } : null,
                  pressed && !disabled ? { opacity: 0.85 } : null,
                ]}
              >
                <Icon size={actionIcon} />
                <Text
                  numberOfLines={2}
                  style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
            {row.length < 4
              ? Array.from({ length: 4 - row.length }, (_, pad) => <View key={`pad-${pad}`} style={styles.spacer} />)
              : null}
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  spacer: {
    flex: 1,
  },
  label: {
    fontSize: 11.5,
    textAlign: "center",
    lineHeight: 15,
  },
});
