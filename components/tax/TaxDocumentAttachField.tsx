import { StyleSheet, Text, View } from "react-native";
import { Paperclip } from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { TAX_LIMITS, type TaxDocument } from "@/shared/features/tax/types";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Attach the year's stored documents to a tax record (SPENDLY-298): tap to
 * attach or detach. Only finished uploads can be attached. Used by every tax
 * record form (income here; TDS, deductions and payments in their stories).
 */
export function TaxDocumentAttachField({
  documents,
  value,
  onChange,
  loading,
}: {
  /** The year's documents; pending ones are left out. */
  documents: readonly TaxDocument[];
  value: readonly string[];
  onChange: (documentIds: string[]) => void;
  loading?: boolean;
}) {
  const { theme } = useTheme();
  const ready = documents.filter((d) => d.status === "ready");
  const selected = new Set(value);
  const full = selected.size >= TAX_LIMITS.maxDocumentIds;
  const helper = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <View style={{ gap: theme.space.sm }}>
      <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
        Proof (optional)
      </Text>
      {loading ? (
        <Text style={helper}>Loading your documents…</Text>
      ) : ready.length === 0 ? (
        <Text style={helper}>No documents for this year yet. Add them under Documents in the Tax center, then attach them here.</Text>
      ) : (
        <View style={[styles.wrap, { gap: theme.space.sm }]}>
          {ready.map((d) => {
            const on = selected.has(d.id);
            return (
              <Chip
                key={d.id}
                label={d.name}
                selected={on}
                onPress={() => onChange(on ? value.filter((id) => id !== d.id) : [...value, d.id])}
                disabled={!on && full}
                appearance="outline"
                size="sm"
                icon={(color) => <Paperclip size={12} color={color} />}
                accessibilityRole="button"
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
