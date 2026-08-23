import { Pressable, Text, View } from "react-native";

import type { GaneshRole } from "@/shared/types/ganesh";
import { ganeshRoleLabel } from "@/shared/utils/ganeshPermissions";
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
                fontWeight: "700",
              }}
            >
              {ganeshRoleLabel(role)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
