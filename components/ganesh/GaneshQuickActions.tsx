import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Gift, Landmark, Plus, Receipt, Wallet } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

const ACTIONS = [
  { href: "/(ganesh)/add-collection", label: "+ Collection", Icon: Wallet },
  { href: "/(ganesh)/add-expense", label: "+ Expense", Icon: Receipt },
  { href: "/(ganesh)/add-contribution", label: "+ Contribution", Icon: Gift },
  { href: "/(ganesh)/add-member-payment", label: "+ Member payment", Icon: Landmark },
] as const;

export function GaneshQuickActions({ disabled }: { disabled?: boolean }) {
  const { theme } = useTheme();
  const { push } = useRouter();

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
        Quick actions
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {ACTIONS.map(({ href, label, Icon }) => (
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
      </View>
    </View>
  );
}
