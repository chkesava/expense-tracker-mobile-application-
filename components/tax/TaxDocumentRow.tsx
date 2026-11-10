import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, FileText, Image as ImageIcon, UploadCloud } from "lucide-react-native";

import { useSettings } from "@/providers/SettingsProvider";
import type { TaxDocument } from "@/shared/features/tax/types";
import { isStuckTaxDocument } from "@/shared/features/tax/utils/documents";
import { formatDocumentSize } from "@/shared/utils/accountDocuments";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One stored tax document (SPENDLY-298): its name, kind, size and date, and
 * "Upload unfinished" while its file hasn't landed. A list row, not a card.
 */
export const TaxDocumentRow = memo(function TaxDocumentRow({
  document,
  nowMs,
  onPress,
}: {
  document: TaxDocument;
  nowMs: number;
  onPress: (document: TaxDocument) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const pending = document.status === "pending";
  const stuck = isStuckTaxDocument(document, nowMs);
  const Icon = pending ? UploadCloud : document.mimeType === "application/pdf" ? FileText : ImageIcon;
  const date = new Date(document.uploadedAtMs ?? document.createdAtMs).toISOString().slice(0, 10);
  const meta = [formatDocumentSize(document.sizeBytes), formatDisplayDate(date, settings?.dateFormat)].join(" · ");
  const warn = theme.colors.warning;

  return (
    <Pressable
      onPress={() => onPress(document)}
      accessibilityRole="button"
      accessibilityLabel={`${document.name}, ${meta}${pending ? ", upload unfinished" : ""}`}
      accessibilityHint={pending ? "Opens options to finish or remove the upload" : "Opens options to view, edit or delete"}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.space.lg,
          paddingVertical: theme.space.md,
          gap: theme.space.md,
          borderBottomColor: surfaces.divider,
          backgroundColor: pressed ? surfaces.tile : "transparent",
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: pending ? withAlpha(warn, 0.12) : surfaces.tile, borderRadius: theme.radius.md }]}>
        <Icon size={18} color={pending ? warn : theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {document.name}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {meta}
        </Text>
        {pending ? (
          <Text style={{ color: warn, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs }}>
            {stuck ? "Upload unfinished for a while. Tap to retry or remove." : "Upload not finished. Tap to retry or remove."}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
