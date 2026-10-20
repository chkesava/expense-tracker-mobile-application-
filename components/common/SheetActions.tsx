import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";

export type SheetAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

/**
 * The action row of a Spendly form sheet (SPENDLY-548), for the `footer` slot
 * of `common/Modal`: an optional secondary action (usually Cancel) and the
 * primary action, which takes the larger share so it is the obvious target.
 * `tone="destructive"` is for delete and similar irreversible actions.
 *
 * Usage, and the rest of the pattern (title, body spacing), is in
 * docs/SPENDLY-548-form-foundations.md.
 */
export function SheetActions({
  primary,
  secondary,
  tone = "primary",
}: {
  primary: SheetAction;
  secondary?: SheetAction;
  tone?: "primary" | "destructive";
}) {
  return (
    <View style={styles.row}>
      {secondary ? (
        <Button
          variant="ghost"
          onPress={secondary.onPress}
          disabled={secondary.disabled}
          accessibilityLabel={secondary.accessibilityLabel ?? secondary.label}
          style={styles.secondary}
        >
          {secondary.label}
        </Button>
      ) : null}
      <Button
        variant={tone === "destructive" ? "destructive" : "primary"}
        onPress={primary.onPress}
        disabled={primary.disabled}
        loading={primary.loading}
        accessibilityLabel={primary.accessibilityLabel ?? primary.label}
        style={styles.primary}
      >
        {primary.label}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  secondary: {
    flex: 1,
    minHeight: 48,
  },
  primary: {
    flex: 2,
    minHeight: 48,
  },
});
