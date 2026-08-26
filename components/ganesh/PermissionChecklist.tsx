import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, Check } from "lucide-react-native";

import { MetaLabel, Section, useGaneshTokens } from "@/components/ganesh/ui";
import { haptic } from "@/lib/haptics";
import {
  ADMIN_ONLY_PERMISSION_GROUPS,
  ALL_PERMISSION_GROUPS,
  CRITICAL_PERMISSIONS,
  PERMISSION_GROUPS,
  togglePermission,
  type PermissionGroup,
} from "@/shared/utils/ganeshPermissionRegistry";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";
import { useTheme } from "@/theme/ThemeProvider";

/** Square checkbox matching the app's control weight. */
function Checkbox({ on, tint }: { on: boolean; tint: string }) {
  const g = useGaneshTokens();
  return (
    <View
      style={[
        styles.checkbox,
        on
          ? { backgroundColor: tint, borderColor: tint }
          : { backgroundColor: "transparent", borderColor: g.divider },
      ]}
    >
      {on ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

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
  const g = useGaneshTokens();

  const keys = group.items.map((item) => item.key);
  const onCount = keys.filter((key) => selected.includes(key)).length;
  const allOn = onCount === keys.length;

  return (
    <Section
      title={group.label}
      subtitle={`${onCount} of ${keys.length} allowed`}
      action={
        <Pressable
          onPress={() => {
            void haptic.selection();
            let next = [...selected];
            for (const key of keys) next = togglePermission(next, key, !allOn);
            onChange(next);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={allOn ? `Clear all ${group.label}` : `Allow all ${group.label}`}
          style={({ pressed }) => [styles.groupAction, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.groupActionLabel, { color: g.saffron, fontFamily: theme.fontFamily.semibold }]}>
            {allOn ? "Clear" : "Allow all"}
          </Text>
        </Pressable>
      }
    >
      {group.items.map((item, index) => {
        const on = selected.includes(item.key);
        const critical = CRITICAL_PERMISSIONS.includes(item.key);

        return (
          <Pressable
            key={item.key}
            onPress={() => {
              void haptic.selection();
              onChange(togglePermission(selected, item.key, !on));
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${group.label}: ${item.label}${critical ? ", sensitive" : ""}`}
            android_ripple={{
              color: g.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
              borderless: false,
            }}
            style={({ pressed }) => [
              styles.permRow,
              index < group.items.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: g.divider,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Checkbox on={on} tint={g.saffron} />
            <Text
              style={[
                styles.permLabel,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
              ]}
            >
              {item.label}
            </Text>
            {critical ? (
              <View style={styles.criticalTag}>
                <AlertTriangle size={11} color={theme.colors.warning} strokeWidth={2.4} />
                <Text
                  style={[
                    styles.criticalLabel,
                    { color: theme.colors.warning, fontFamily: theme.fontFamily.medium },
                  ]}
                >
                  Sensitive
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </Section>
  );
}

/**
 * Grouped permission controls.
 *
 * The brief was explicit: no giant list of checkboxes. Each capability area is
 * its own `Section` with a running "n of m allowed" count and one bulk toggle,
 * and permissions that can move money or change the committee are tagged
 * `Sensitive` in text — not by colour alone.
 */
export function PermissionChecklist({
  selected,
  onChange,
}: {
  selected: GaneshPermission[];
  onChange: (next: GaneshPermission[]) => void;
}) {
  return (
    <View style={styles.stack}>
      {PERMISSION_GROUPS.map((group) => (
        <GroupBlock key={group.id} group={group} selected={selected} onChange={onChange} />
      ))}
      <AdminOnlyNote />
    </View>
  );
}

/**
 * These areas used to appear as ordinary checkboxes, but the security rules only
 * ever accepted a Pandal Admin for them, so granting one produced buttons that
 * failed at the server. Saying that here is better than quietly omitting three
 * sections an admin might go looking for.
 */
function AdminOnlyNote() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const areas = ADMIN_ONLY_PERMISSION_GROUPS.map((group) => group.label).join(", ");

  return (
    <Section title="Pandal Admins only">
      <View style={[styles.adminOnlyNote, { borderColor: g.divider }]}>
        <Text
          style={[
            styles.emptyText,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
          ]}
        >
          {areas} stay with Pandal Admins and cannot be given to a role. Make someone a
          Pandal Admin if they need to manage the committee.
        </Text>
      </View>
    </Section>
  );
}

/** Read-only view of what a role can do. Shows only what is granted. */
export function PermissionSummary({
  permissions,
}: {
  permissions: readonly GaneshPermission[];
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();

  const granted = ALL_PERMISSION_GROUPS.map((group) => ({
    group,
    items: group.items.filter((item) => permissions.includes(item.key)),
  })).filter((entry) => entry.items.length > 0);

  if (granted.length === 0) {
    return (
      <Section title="Permissions">
        <Text
          style={[
            styles.emptyText,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
          ]}
        >
          This role cannot do anything yet. Edit it to choose what it can access.
        </Text>
      </Section>
    );
  }

  return (
    <Section title="Permissions" subtitle={`${permissions.length} allowed`}>
      <View style={styles.summaryStack}>
        {granted.map(({ group, items }) => (
          <View key={group.id} style={styles.summaryGroup}>
            <MetaLabel>{group.label}</MetaLabel>
            <View style={styles.summaryItems}>
              {items.map((item) => (
                <View key={item.key} style={styles.summaryItem}>
                  <Check size={13} color={g.godFund} strokeWidth={3} />
                  <Text
                    style={[
                      styles.summaryLabel,
                      { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
            {items.length < group.items.length ? (
              <Text
                style={[
                  styles.summaryRest,
                  { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                ]}
              >
                {group.items.length - items.length} not allowed
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  groupAction: {
    minHeight: 32,
    justifyContent: "center",
  },
  groupActionLabel: {
    fontSize: 13,
  },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderCurve: "continuous",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  permLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  criticalTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  criticalLabel: {
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  summaryStack: {
    gap: 14,
  },
  summaryGroup: {
    gap: 5,
  },
  summaryItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryRest: {
    fontSize: 11.5,
  },
  adminOnlyNote: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
});
