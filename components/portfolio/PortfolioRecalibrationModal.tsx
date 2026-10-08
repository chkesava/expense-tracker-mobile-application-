import React, { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, RefreshCw, Wrench, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SheetBottomInset } from "@/components/common/SheetBottomInset";
import { usePortfolioReconciliation } from "@/hooks/usePortfolioReconciliation";
import type { ReconciliationFinding } from "@/shared/features/portfolio/utils/portfolioReconciliation";
import { useTheme } from "@/theme/ThemeProvider";
import { useSurfaces } from "@/theme/surfaces";
import { haptic } from "@/lib/haptics";

interface PortfolioRecalibrationModalProps {
  visible: boolean;
  onClose: () => void;
}

const FINDING_COPY: Record<ReconciliationFinding["type"], string> = {
  missing_buy_recoverable_from_cash: "Missing Order History row — recoverable from your cash ledger",
  missing_buy_unrecoverable: "Missing trade history with no matching cash record",
  missing_cash_for_app_funded_holding: "No Investment Cash entry found for this holding",
  qty_mismatch: "Quantity doesn't match its trade history",
  avg_price_mismatch: "Average price doesn't match its trade history",
  duplicate_transaction: "Possible duplicate purchase record",
  orphaned_transaction: "Trade record points at a holding that no longer exists",
  cash_balance_drift: "Investment Cash balance looks out of step",
  negative_or_impossible_quantity: "Holding has an impossible quantity",
};

/**
 * Scan → Preview → Repair flow for SPENDLY-419.
 *
 * Only `auto_repair` findings (a cash PURCHASE/SALE entry exists but its
 * `portfolioTransactions` row doesn't — see `scanHoldingForFindings`) are ever
 * written by Repair. Everything else is shown so the user can fix it themselves
 * (an edit, a trade, or a cash adjustment) — this flow never guesses a trade or
 * invents a cash movement.
 */
export function PortfolioRecalibrationModal({
  visible,
  onClose,
}: PortfolioRecalibrationModalProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { stage, report, scan, repair, reset } = usePortfolioReconciliation();

  useEffect(() => {
    if (visible) scan();
    else reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const autoRepairable = report?.findings.filter((f) => f.action === "auto_repair") ?? [];
  const needsInput = report?.findings.filter((f) => f.action === "needs_user_input") ?? [];
  const skipped = report?.findings.filter((f) => f.action === "skip_external") ?? [];

  const handleRepair = async () => {
    haptic.selection().catch(() => undefined);
    await repair();
  };

  const renderFinding = (finding: ReconciliationFinding, tone: "repair" | "input" | "skip") => (
    <View
      key={finding.id}
      style={[styles.findingRow, { borderColor: theme.colors.border }]}
    >
      <View
        style={[
          styles.findingIcon,
          {
            backgroundColor: surfaces.control,
          },
        ]}
      >
        {tone === "repair" ? (
          <Wrench size={15} color={theme.colors.primary} />
        ) : tone === "input" ? (
          <AlertTriangle size={15} color={theme.colors.warning ?? theme.colors.foreground} />
        ) : (
          <CheckCircle2 size={15} color={theme.colors.mutedForeground} />
        )}
      </View>
      <View style={styles.findingBody}>
        <Text
          style={{ fontSize: theme.typography.sm, fontWeight: "700", color: theme.colors.foreground }}
        >
          {finding.symbol || finding.holdingId}
        </Text>
        <Text
          style={{ fontSize: theme.typography.xs, color: theme.colors.mutedForeground }}
          numberOfLines={2}
        >
          {FINDING_COPY[finding.type]}
        </Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Card
          style={[
            styles.contentCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={{ fontSize: theme.typography.lg, fontWeight: "800", color: theme.colors.foreground }}>
                Recalibrate Portfolio
              </Text>
              <Text style={{ fontSize: theme.typography.xs, color: theme.colors.mutedForeground }}>
                Checks your holdings, Order History and Investment Cash for mismatches
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.closeButton, { backgroundColor: surfaces.track }]}
            >
              <X size={18} color={theme.colors.foreground} />
            </Pressable>
          </View>

          {stage === "scanning" ? (
            <View style={styles.emptyState}>
              <RefreshCw size={22} color={theme.colors.primary} />
              <Text style={{ fontSize: theme.typography.sm, color: theme.colors.mutedForeground }}>
                Scanning your portfolio…
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              {report && report.findings.length === 0 ? (
                <View style={styles.emptyState}>
                  <CheckCircle2 size={28} color={theme.colors.success ?? theme.colors.primary} />
                  <Text style={{ fontSize: theme.typography.sm, fontWeight: "700", color: theme.colors.foreground }}>
                    Everything reconciles
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.typography.xs,
                      color: theme.colors.mutedForeground,
                      textAlign: "center",
                    }}
                  >
                    Every holding's quantity, Order History and Investment Cash movements agree.
                  </Text>
                </View>
              ) : (
                <>
                  {autoRepairable.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: theme.typography.xs, fontWeight: "700", color: theme.colors.foreground }}>
                        Can repair automatically ({autoRepairable.length})
                      </Text>
                      {autoRepairable.map((f) => renderFinding(f, "repair"))}
                    </View>
                  ) : null}

                  {needsInput.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: theme.typography.xs, fontWeight: "700", color: theme.colors.foreground }}>
                        Needs your input ({needsInput.length})
                      </Text>
                      {needsInput.map((f) => renderFinding(f, "input"))}
                      <Text style={{ fontSize: theme.typography.xs, color: theme.colors.mutedForeground, lineHeight: 17 }}>
                        These can't be repaired automatically — record the missing trade or cash
                        movement yourself to clear them.
                      </Text>
                    </View>
                  ) : null}

                  {skipped.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: theme.typography.xs, fontWeight: "700", color: theme.colors.foreground }}>
                        Intentionally external ({skipped.length})
                      </Text>
                      {skipped.map((f) => renderFinding(f, "skip"))}
                    </View>
                  ) : null}
                </>
              )}
              <View style={{ height: 8 }} />
            </ScrollView>
          )}

          <View style={styles.footer}>
            {stage === "done" ? (
              <Button onPress={onClose}>Done</Button>
            ) : (
              <Button
                onPress={handleRepair}
                loading={stage === "repairing"}
                disabled={stage !== "preview" || autoRepairable.length === 0}
              >
                {autoRepairable.length > 0
                  ? `Repair ${autoRepairable.length} automatically`
                  : "Nothing to auto-repair"}
              </Button>
            )}
          </View>
          <SheetBottomInset />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  contentCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 20,
    maxHeight: "85%",
    borderWidth: 1,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  findingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  findingIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  findingBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  footer: {
    paddingTop: 4,
  },
});
