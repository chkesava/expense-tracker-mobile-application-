import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Gift, Landmark, Plus, Receipt, Wallet } from "lucide-react-native";

import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

const ACTIONS: Array<{
  href: string;
  label: string;
  Icon: typeof Wallet;
  permission: GaneshPermission;
}> = [
  { href: "/(ganesh)/add-collection", label: "+ Collection", Icon: Wallet, permission: "collections.create" },
  { href: "/(ganesh)/add-expense", label: "+ Expense", Icon: Receipt, permission: "expenses.create" },
  { href: "/(ganesh)/add-contribution", label: "+ Contribution", Icon: Gift, permission: "contributions.create" },
  { href: "/(ganesh)/add-member-payment", label: "+ Member payment", Icon: Landmark, permission: "contributions.create" },
];

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
  const visible = ACTIONS.filter((action) => can(action.permission));
  const showOpening = can("openingFunds.create");

  if (visible.length === 0 && !showOpening && !showAddPermanentFund) return null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
        Quick actions
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {visible.map(({ href, label, Icon }) => (
          <Pressable
            key={href}
            disabled={disabled}
            onPress={() => push(href as never)}
            style={({ pressed }) => ({
              flexGrow: 1,
              minWidth: "45%",
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              gap: 8,
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Icon size={18} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        ))}
        {showAddPermanentFund ? (
          <Pressable
            onPress={() => push("/(ganesh)/add-permanent-fund" as never)}
            style={({ pressed }) => ({
              flexGrow: 1,
              minWidth: "45%",
              backgroundColor: theme.colors.muted,
              borderRadius: 16,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Landmark size={18} color={theme.colors.foreground} />
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              Permanent Fund
            </Text>
          </Pressable>
        ) : null}
        {showOpening ? (
          <Pressable
            disabled={disabled}
            onPress={() => push("/(ganesh)/add-opening-fund" as never)}
            style={({ pressed }) => ({
              flexGrow: 1,
              minWidth: "45%",
              backgroundColor: theme.colors.muted,
              borderRadius: 16,
              padding: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <Plus size={18} color={theme.colors.foreground} />
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              Opening fund
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
