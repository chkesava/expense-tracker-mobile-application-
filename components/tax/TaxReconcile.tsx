import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { toneColor } from "@/components/tax/TaxLineRow";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Button } from "@/components/ui/Button";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import type { TaxStatement } from "@/shared/features/tax/types";
import { tdsStatePresentation, type TdsMatchRow, type TdsSide } from "@/shared/features/tax/utils/tdsReconcile";
import { useSurfaces, withAlpha } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/** One deductor and section, compared (SPENDLY-291). */
export const TaxReconcileRow = memo(function TaxReconcileRow({
  row,
  statement,
  currency,
  onPress,
}: {
  row: TdsMatchRow;
  statement: TaxStatement | null;
  currency: string;
  onPress: (row: TdsMatchRow) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const status = tdsStatePresentation(row.state, statement);
  const color = toneColor(status.tone, theme.colors);
  const detail = [row.groupLabel, row.tanMasked ? `TAN ${row.tanMasked}` : null].filter(Boolean).join(" · ");
  const difference = row.tdsDifference && row.tdsDifference !== 0 ? `TDS differs by ${money(Math.abs(row.tdsDifference))}` : null;
  return (
    <Pressable
      onPress={() => onPress(row)}
      accessibilityRole="button"
      accessibilityLabel={`${row.label}, ${detail}, ${status.label}${difference ? `, ${difference}` : ""}`}
      accessibilityHint="Opens the comparison"
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.md, borderBottomColor: surfaces.divider, backgroundColor: pressed ? surfaces.tile : "transparent" },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>
          {row.label}
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {detail}
        </Text>
        <View style={[styles.pill, { backgroundColor: withAlpha(color, 0.14), borderRadius: theme.radius.full }]}>
          <Text style={{ color, fontFamily: theme.fontFamily.semibold, fontSize: 11, lineHeight: 15 }}>{status.label}</Text>
        </View>
        {difference ? <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{difference}</Text> : null}
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
});

/**
 * The comparison for one row: both sides side by side, what differs and by
 * how much, and (for a difference) accept it or undo the acceptance.
 */
export function TaxReconcileSheet({
  row,
  statement,
  currency,
  saving,
  online,
  onAccept,
  onUndo,
  onClose,
}: {
  row: TdsMatchRow | null;
  statement: TaxStatement | null;
  currency: string;
  saving: boolean;
  online: boolean;
  onAccept: (row: TdsMatchRow) => void;
  onUndo: (row: TdsMatchRow) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  if (!row) return null;
  const status = tdsStatePresentation(row.state, statement);
  const where = statement ?? "statement";
  const amount = (n: number | null | undefined) => (n === null || n === undefined ? "Not given" : money(n));
  const side = (title: string, s: TdsSide | null) => (
    <View style={[styles.side, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md, gap: 4 }]}>
      <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs }}>{title}</Text>
      {s ? (
        <>
          <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>{money(s.tds)}</Text>
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
            TDS · paid {amount(s.paid)} · {s.entryIds.length} line{s.entryIds.length === 1 ? "" : "s"}
          </Text>
        </>
      ) : (
        <Text style={{ color: theme.colors.warning, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.sm }}>Nothing yet</Text>
      )}
    </View>
  );

  const explain = (() => {
    switch (row.state) {
      case "matched":
        return "Your certificates and your statement agree to the paisa.";
      case "mismatch":
      case "accepted":
      case "accepted_changed":
        return [
          row.tdsDifference ? `TDS: your ${where} shows ${money(Math.abs(row.tdsDifference))} ${row.tdsDifference > 0 ? "more" : "less"} than your certificates.` : null,
          row.paidDifference ? `Amount paid: your ${where} shows ${money(Math.abs(row.paidDifference))} ${row.paidDifference > 0 ? "more" : "less"}.` : null,
          row.paidDifference === null ? "Amount paid isn't compared: one side doesn't give it." : null,
        ]
          .filter(Boolean)
          .join(" ");
      case "missing_in_statement":
        return `This deduction isn't in the ${where} lines you added. Check your ${where}, or add the line from it.`;
      case "missing_in_records":
        return `Your ${where} reports this, but you haven't added the certificate. Add it, or check with the deductor.`;
      case "needs_tan":
        return "Without the deductor's TAN this can't be compared. Add the TAN printed on the certificate or statement.";
    }
  })();

  return (
    <Modal density="compact" isOpen onClose={onClose} title={row.label}>
      <View style={{ gap: theme.space.md }}>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {[row.groupLabel, row.tanMasked ? `TAN ${row.tanMasked}` : null].filter(Boolean).join(" · ")} · {status.label}
        </Text>
        <View style={[styles.sides, { gap: theme.space.sm }]}>
          {side("Your certificates", row.mine)}
          {side(`Your ${where}`, row.reported)}
        </View>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm, lineHeight: 20 }}>{explain}</Text>
        {row.state === "accepted_changed" ? (
          <TaxNotice tone="warning">The difference changed after you accepted it. Check it again.</TaxNotice>
        ) : null}
        {row.state === "mismatch" || row.state === "accepted_changed" ? (
          <Button
            variant="tonal"
            onPress={() => (onAccept(row), onClose())}
            disabled={saving || !online}
            accessibilityLabel="Accept this difference: you've checked it and it's correct"
          >
            Accept this difference
          </Button>
        ) : null}
        {row.state === "accepted" || row.state === "accepted_changed" ? (
          <Button variant="ghost" onPress={() => (onUndo(row), onClose())} disabled={saving}>
            Undo acceptance
          </Button>
        ) : null}
        {!online && (row.state === "mismatch" || row.state === "accepted_changed") ? (
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
            Accepting needs a connection, to check the figures first.
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 },
  sides: { flexDirection: "row", flexWrap: "wrap" },
  side: { flexGrow: 1, flexBasis: 140 },
});
