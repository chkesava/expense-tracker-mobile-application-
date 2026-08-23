import { Pressable, Text, View } from "react-native";

import {
  PERMISSION_GROUPS,
  togglePermission,
  type PermissionGroup,
} from "@/shared/utils/ganeshPermissionRegistry";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

function GroupBlock({
  group,
  selected,
  onChange,
}: {
  group: PermissionGroup;
  selected: GaneshPermission[];
  onChange: (next: GaneshPermission[]) => void;
}) {
  const { theme } = useTheme();
  const keys = group.items.map((item) => item.key);
  const allOn = keys.every((key) => selected.includes(key));

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{group.label}</Text>
        <Pressable
          onPress={() => {
            let next = [...selected];
            if (allOn) {
              for (const key of keys) next = togglePermission(next, key, false);
            } else {
              for (const key of keys) next = togglePermission(next, key, true);
            }
            onChange(next);
          }}
          style={{ minHeight: 40, justifyContent: "center" }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
            {allOn ? "Clear" : "Select all"}
          </Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {group.items.map((item) => {
          const on = selected.includes(item.key);
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(togglePermission(selected, item.key, !on))}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 44,
                borderRadius: 999,
                backgroundColor: on ? theme.colors.primary : theme.colors.muted,
              }}
            >
              <Text
                style={{
                  color: on ? theme.colors.primaryForeground : theme.colors.foreground,
                  fontWeight: "700",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PermissionChecklist({
  selected,
  onChange,
}: {
  selected: GaneshPermission[];
  onChange: (next: GaneshPermission[]) => void;
}) {
  return (
    <View style={{ gap: 18 }}>
      {PERMISSION_GROUPS.map((group) => (
        <GroupBlock key={group.id} group={group} selected={selected} onChange={onChange} />
      ))}
    </View>
  );
}

export function PermissionSummary({
  permissions,
}: {
  permissions: readonly GaneshPermission[];
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {PERMISSION_GROUPS.map((group) => {
        const items = group.items.filter((item) => permissions.includes(item.key));
        if (items.length === 0) return null;
        return (
          <View key={group.id} style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{group.label}</Text>
            {group.items.map((item) => (
              <Text key={item.key} style={{ color: theme.colors.mutedForeground }}>
                {permissions.includes(item.key) ? "✓" : "✗"} {item.label}
              </Text>
            ))}
          </View>
        );
      })}
    </View>
  );
}
