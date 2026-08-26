import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { formatInr } from "@/shared/utils/ganeshMoney";
import type { Household } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Shown when a new collection looks like it belongs to a household that already
 * exists.
 *
 * The dialog used to offer only Cancel and Continue, and Continue ran the same
 * save that created a *second* household row — so a house paying ₹200 then ₹300
 * against a ₹500 target produced two `partial` rows and never reached `paid`
 * (GS-006). The merge action is now the primary one, per match, and creating a
 * duplicate anyway is the deliberate secondary.
 *
 * `busy` disables every action while a save is in flight. Without it the buttons
 * stayed live and a double tap recorded the collection twice (GS-028).
 */
export function DuplicateHouseholdDialog({
  matches,
  busy = false,
  onCancel,
  onMerge,
  onCreateNew,
}: {
  matches: Household[];
  busy?: boolean;
  onCancel: () => void;
  onMerge: (householdId: string) => void;
  onCreateNew: () => void;
}) {
  const { theme } = useTheme();
  if (matches.length === 0) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={busy ? () => undefined : onCancel}
    >
      <Pressable
        onPress={busy ? undefined : onCancel}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 20,
            padding: 20,
            gap: 12,
            maxHeight: "80%",
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "800" }}>
            {matches.length === 1 ? "This household already exists" : "These households already exist"}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            Add this payment to one of them so the household total and its paid status stay
            correct. Only create a new one if this really is a different house.
          </Text>

          <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 10 }}>
            {matches.map((household) => (
              <View
                key={household.id}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 14,
                  padding: 12,
                  gap: 8,
                }}
              >
                <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
                  {household.name}
                  {household.houseNumber ? ` · House #${household.houseNumber}` : ""}
                </Text>
                <Text style={{ color: theme.colors.mutedForeground }}>
                  {household.expectedAmount > 0
                    ? `Collected ${formatInr(household.collectedAmount)} of ${formatInr(household.expectedAmount)}`
                    : `Collected ${formatInr(household.collectedAmount)}`}
                </Text>
                <Button disabled={busy} onPress={() => onMerge(household.id)}>
                  Add to this household
                </Button>
              </View>
            ))}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button variant="outline" disabled={busy} onPress={onCancel} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button variant="outline" disabled={busy} onPress={onCreateNew} style={{ flex: 1 }}>
              Create new anyway
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
