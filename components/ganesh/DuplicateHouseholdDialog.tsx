import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { formatInr } from "@/shared/utils/ganeshMoney";
import type { Household } from "@/shared/types/ganesh";
import { useTheme } from "@/theme/ThemeProvider";

export function DuplicateHouseholdDialog({
  matches,
  onCancel,
  onContinue,
}: {
  matches: Household[];
  onCancel: () => void;
  onContinue: () => void;
}) {
  const { theme } = useTheme();
  const first = matches[0];
  if (!first) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
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
          }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "800" }}>
            Possible existing household
          </Text>
          <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
            {first.name}
            {first.houseNumber ? ` · House #${first.houseNumber}` : ""}
            {`\nLast collection: ${formatInr(first.collectedAmount)}`}
          </Text>
          <Text style={{ color: theme.colors.mutedForeground }}>
            Continue anyway? Repeat contributions are allowed.
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button variant="outline" onPress={onCancel} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button onPress={onContinue} style={{ flex: 1 }}>
              Continue
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
