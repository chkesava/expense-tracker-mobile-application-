import { Pressable, Text, View } from "react-native";

import type { GaneshRole } from "@/shared/types/ganesh";
import { useGaneshT } from "@/providers/GaneshI18nProvider";
import { ganeshRoleLabelKey } from "@/shared/utils/ganeshPermissions";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useTheme } from "@/theme/ThemeProvider";

export function RoleChips({
  value,
  options,
  onChange,
}: {
  value: GaneshRole;
  options: GaneshRole[];
  onChange: (role: GaneshRole) => void;
}) {
  const { theme } = useTheme();
  const t = useGaneshT();
  const g = useGaneshTokens();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((role) => {
        const selected = value === role;
        return (
          <Pressable
            key={role}
            onPress={() => onChange(role)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: selected ? theme.colors.primary : theme.colors.muted,
            }}
          >
            <Text
              style={{
                color: selected ? theme.colors.primaryForeground : theme.colors.foreground,
                fontFamily: g.font.semibold,
              }}
            >
              {t(ganeshRoleLabelKey(role))}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
