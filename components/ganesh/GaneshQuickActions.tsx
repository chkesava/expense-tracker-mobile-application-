import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Gift, Landmark, PiggyBank, Receipt, Wallet, type LucideIcon } from "lucide-react-native";

import { Section, useSurfaces, GANESH_RADIUS } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { haptic } from "@/lib/haptics";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

type QuickAction = {
  href: string;
  label: string;
  Icon: LucideIcon;
  permission: GaneshPermission;
};

const ACTIONS: QuickAction[] = [
  { href: "/(ganesh)/add-collection", label: "Collection", Icon: Wallet, permission: "collections.create" },
  { href: "/(ganesh)/add-expense", label: "Expense", Icon: Receipt, permission: "expenses.create" },
  { href: "/(ganesh)/add-contribution", label: "Contribution", Icon: Gift, permission: "contributions.create" },
  { href: "/(ganesh)/add-member-payment", label: "Member payment", Icon: PiggyBank, permission: "contributions.create" },
];

/**
 * Quick actions. Recording money is the app's core job, so the four write
 * paths sit one tap from Home — as low-contrast tiles, not as four more cards.
 */
export function GaneshQuickActions({
  disabled,
  showAddPermanentFund,
}: {
  disabled?: boolean;
  showAddPermanentFund?: boolean;
}) {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { can } = useGaneshPermissions();
  const g = useGaneshTokens();
  const surfaces = useSurfaces();

  const items: Array<{ href: string; label: string; Icon: LucideIcon; tint: string }> = ACTIONS
    .filter((action) => can(action.permission))
    .map((action) => ({ ...action, tint: g.saffron }));

  if (can("openingFunds.create")) {
    items.push({
      href: "/(ganesh)/add-opening-fund",
      label: "Opening fund",
      Icon: PiggyBank,
      tint: g.godFund,
    });
  }
  if (showAddPermanentFund) {
    items.push({
      href: "/(ganesh)/add-permanent-fund",
      label: "Permanent Fund",
      Icon: Landmark,
      tint: g.maroon,
    });
  }

  if (items.length === 0) return null;

  return (
    <Section title="Quick actions" plain>
      <View style={styles.grid}>
        {items.map(({ href, label, Icon, tint }) => (
          <Pressable
            key={href}
            disabled={disabled}
            onPress={() => {
              void haptic.selection();
              push(href as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Add ${label}`}
            android_ripple={{
              color: surfaces.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
              borderless: false,
            }}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: surfaces.tile },
              disabled && { opacity: 0.45 },
              pressed && !disabled && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.glyph, { backgroundColor: g.wash(tint) }]}>
              <Icon size={16} color={tint} strokeWidth={2.2} />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: GANESH_RADIUS.tile,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  glyph: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
  },
});
