import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { TaxNotice } from "@/components/tax/TaxNotice";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import type { SaleDecision } from "@/services/tax/taxCapitalGainStore";
import { TAX_ASSET_CLASSES } from "@/shared/features/tax/types";
import {
  ASSET_CLASS_LABELS,
  CG_ATTENTION_TEXT,
  CG_TERM_TITLES,
  capitalGainStatus,
  holdingText,
} from "@/shared/features/tax/utils/capitalGainLabels";
import type { CapitalGainRow } from "@/shared/features/tax/utils/capitalGains";
import { roundMoney } from "@/shared/utils/money";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * One sale Spendly found in the portfolio (SPENDLY-293): what the trades say
 * (source) apart from what Spendly worked out (calculated), why it may need a
 * look, and the user's decision: count it, leave it out, or say what kind of
 * asset it is. A sale that used several buys shows each lot.
 */
export function TaxCapitalGainSheet({
  rows,
  currency,
  formatDate,
  saving,
  onDecide,
  onUndo,
  onClose,
}: {
  /** The lots of one sale; empty closes the sheet. */
  rows: readonly CapitalGainRow[];
  currency: string;
  formatDate: (date: string) => string;
  saving: boolean;
  onDecide: (sale: { id: string; saleValue: number }, choice: SaleDecision) => void;
  onUndo: (saleId: string) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const [choosingClass, setChoosingClass] = useState(false);
  const saleId = rows[0]?.saleRef.id;
  useEffect(() => setChoosingClass(false), [saleId]);

  if (rows.length === 0 || !saleId) return null;
  const first = rows[0];
  const saleValue = roundMoney(rows.reduce((s, r) => s + r.saleValue, 0));
  const status = capitalGainStatus(first);
  const attention = [...new Set(rows.flatMap((r) => r.attention))];
  const date = (d: string | null) => (d ? formatDate(d) : "Not recorded");
  const decide = (choice: SaleDecision) => {
    onDecide({ id: saleId, saleValue }, choice);
    onClose();
  };

  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const label = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium, fontSize: theme.typography.xs };
  const value = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };

  const line = (name: string, text: string) => (
    <View key={name} style={styles.line}>
      <Text style={label}>{name}</Text>
      <Text style={value}>{text}</Text>
    </View>
  );

  if (choosingClass) {
    return (
      <Modal density="compact" isOpen onClose={onClose} title="What kind of asset is it?">
        <View style={{ gap: theme.space.md }}>
          <Text style={muted}>
            Spendly put it under {ASSET_CLASS_LABELS[first.assetClass]}. The asset type decides when a sale is long-term. Your
            portfolio isn't changed.
          </Text>
          <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
            {TAX_ASSET_CLASSES.map((id) => (
              <Chip
                key={id}
                label={ASSET_CLASS_LABELS[id]}
                selected={first.assetClass === id}
                onPress={() => decide({ decision: "recategorize", assetClass: id })}
                appearance="outline"
                size="sm"
                accessibilityRole="radio"
              />
            ))}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={onClose} title={first.assetName} density="compact">
      <View style={{ gap: theme.space.lg }}>
        <Text style={muted}>
          {ASSET_CLASS_LABELS[first.assetClass]} · sold {date(first.soldDate)} · {status.label}
        </Text>

        {rows.map((r, i) => (
          <View key={r.key} style={{ gap: theme.space.sm }}>
            {rows.length > 1 ? <Text style={value}>Lot {i + 1} of {rows.length}</Text> : null}
            <Text style={label}>From your trades</Text>
            {line("Quantity", r.quantity === null ? "—" : String(r.quantity))}
            {line("Bought on", date(r.acquiredDate))}
            {line("Cost", r.cost === null ? "Unknown" : money(r.cost))}
            {line("Sale value", money(r.saleValue))}
            {line("Selling charges", money(r.transferExpenses))}
            <Text style={[label, { marginTop: theme.space.xs }]}>Worked out by Spendly</Text>
            {line("Held", holdingText(r.holdingDays)?.replace(/^Held /, "") ?? "Unknown")}
            {line("Term", CG_TERM_TITLES[r.term])}
            {line("Gain", r.gain === null ? "Unknown" : money(r.gain))}
          </View>
        ))}

        {first.term === "unsupported" ? (
          <TaxNotice tone="warning">Crypto and other virtual assets have their own tax rules. Spendly doesn't work out a term for them.</TaxNotice>
        ) : null}
        {attention.map((a) => (
          <TaxNotice key={a} tone="warning">
            {CG_ATTENTION_TEXT[a]}
          </TaxNotice>
        ))}
        {first.status === "replaced_by_statement" ? (
          <TaxNotice>Your statement total for {ASSET_CLASS_LABELS[first.assetClass]} counts instead of this sale.</TaxNotice>
        ) : null}

        <View style={{ gap: theme.space.sm }}>
          {first.status !== "counted" ? (
            <Button onPress={() => decide({ decision: "confirm" })} disabled={saving} loading={saving}>
              Count this sale
            </Button>
          ) : null}
          {first.status !== "left_out" ? (
            <Button variant="tonal" onPress={() => decide({ decision: "exclude" })} disabled={saving}>
              Leave it out
            </Button>
          ) : null}
          <Button variant="ghost" onPress={() => setChoosingClass(true)} disabled={saving}>
            Change asset type…
          </Button>
          {first.decision ? (
            <Button variant="ghost" onPress={() => (onClose(), onUndo(saleId))} disabled={saving}>
              Undo my decision
            </Button>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
});
