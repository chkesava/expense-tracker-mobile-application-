import { StyleSheet, View } from "react-native";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { moveItem } from "@/shared/utils/decisionForm";
import { useTheme } from "@/theme/ThemeProvider";

export interface DecisionListItem {
  id: string;
  text: string;
}

/**
 * Editable list of short text rows (constraints, assumptions) with add,
 * remove and reorder (SPENDLY-363). Icon buttons are labelled for screen
 * readers and meet the 48dp touch target through `Button size="icon"`.
 */
export function DecisionListEditor({
  label,
  items,
  onChange,
  addLabel,
  placeholder,
  newId,
  max,
}: {
  label: string;
  items: DecisionListItem[];
  onChange: (items: DecisionListItem[]) => void;
  addLabel: string;
  placeholder: string;
  newId: () => string;
  max: number;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: theme.space.sm }}>
      {items.map((item, index) => (
        <View key={item.id} style={[styles.row, { gap: theme.space.xs }]}>
          <Input
            value={item.text}
            onChangeText={(text) => onChange(items.map((i) => (i.id === item.id ? { ...i, text } : i)))}
            placeholder={placeholder}
            accessibilityLabel={`${label} ${index + 1}`}
            containerStyle={styles.input}
            maxLength={2000}
          />
          <Button variant="ghost" size="icon" disabled={index === 0} onPress={() => onChange(moveItem(items, index, -1))} accessibilityLabel={`Move ${label.toLowerCase()} ${index + 1} up`}>
            <ArrowUp size={16} color={theme.colors.mutedForeground} />
          </Button>
          <Button variant="ghost" size="icon" disabled={index === items.length - 1} onPress={() => onChange(moveItem(items, index, 1))} accessibilityLabel={`Move ${label.toLowerCase()} ${index + 1} down`}>
            <ArrowDown size={16} color={theme.colors.mutedForeground} />
          </Button>
          <Button variant="ghost" size="icon" onPress={() => onChange(items.filter((i) => i.id !== item.id))} accessibilityLabel={`Remove ${label.toLowerCase()} ${index + 1}`}>
            <Trash2 size={16} color={theme.colors.destructive} />
          </Button>
        </View>
      ))}
      {items.length < max ? (
        <Button variant="tonal" size="sm" onPress={() => onChange([...items, { id: newId(), text: "" }])}>
          {`+ ${addLabel}`}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  input: { flex: 1 },
});
