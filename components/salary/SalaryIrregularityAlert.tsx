import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import {
  SALARY_SIGNAL_DISMISSAL_LABELS,
  SALARY_SIGNAL_DISMISSAL_REASONS,
  type SalarySignal,
  type SalarySignalDismissalReason,
  type SalarySignalKind,
  type SalarySignalSeverity,
} from "@/shared/features/salary/utils/irregularity";
import { formatMonthName } from "@/shared/features/salary/utils/timeline";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface SalaryIrregularityAlertProps {
  signals: SalarySignal[];
  onDismissSignal?: (signal: SalarySignal, reason: SalarySignalDismissalReason) => void;
  onReviewSignal?: (signal: SalarySignal) => void;
  onAddManualPaycheck?: (signal: SalarySignal) => void;
  onReclassifySignal?: (signal: SalarySignal) => void;
  showEmptyState?: boolean;
  testID?: string;
}

export function SalaryIrregularityAlert({
  signals,
  onDismissSignal,
  onReviewSignal,
  onAddManualPaycheck,
  onReclassifySignal,
  showEmptyState = false,
  testID,
}: SalaryIrregularityAlertProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();

  const [dismissingSignal, setDismissingSignal] = useState<SalarySignal | null>(null);
  const [selectedReason, setSelectedReason] = useState<SalarySignalDismissalReason>("false_alarm");

  if (signals.length === 0) {
    if (!showEmptyState) return null;
    return (
      <View
        style={[
          styles.emptyContainer,
          { backgroundColor: surfaces.tile, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          ✓ All regular salary credits on schedule and consistent with your baseline.
        </Text>
      </View>
    );
  }

  const handleConfirmDismiss = () => {
    if (dismissingSignal && onDismissSignal) {
      onDismissSignal(dismissingSignal, selectedReason);
    }
    setDismissingSignal(null);
  };

  return (
    <View style={styles.container} testID={testID}>
      {signals.map((signal) => {
        const borderAccent = getSeverityColor(signal.severity);

        return (
          <View
            key={signal.id}
            style={[
              styles.signalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderLeftColor: borderAccent,
              },
            ]}
          >
            {/* Header: Icon + Title + Severity Pill */}
            <View style={styles.cardHeader}>
              <View style={styles.headerLeft}>
                <SignalIcon kind={signal.kind} severity={signal.severity} />
                <View style={styles.headerTextGroup}>
                  <Text style={[styles.signalTitle, { color: colors.foreground }]}>
                    {signal.title}
                  </Text>
                  <Text style={[styles.signalSubtitle, { color: colors.mutedForeground }]}>
                    {signal.employerName} • {formatMonthName(signal.month)}
                  </Text>
                </View>
              </View>
              <SeverityBadge severity={signal.severity} />
            </View>

            {/* Description */}
            <Text style={[styles.descriptionText, { color: colors.mutedForeground }]}>
              {signal.description}
            </Text>

            {/* Metric Comparison Tile */}
            {(signal.expectedAmount != null || signal.actualAmount != null) && (
              <View
                style={[
                  styles.metricTile,
                  { backgroundColor: surfaces.tile, borderColor: colors.border },
                ]}
              >
                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
                    Expected Baseline
                  </Text>
                  {signal.expectedAmount != null ? (
                    <Amount
                      ghostable
                      value={signal.expectedAmount}
                      currency="INR"
                      style={[styles.metricVal, { color: colors.foreground }]}
                    />
                  ) : (
                    <Text style={[styles.metricMuted, { color: colors.mutedForeground }]}>
                      —
                    </Text>
                  )}
                </View>

                <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />

                <View style={styles.metricItem}>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
                    Detected Credit
                  </Text>
                  {signal.actualAmount != null ? (
                    <Amount
                      ghostable
                      value={signal.actualAmount}
                      currency="INR"
                      style={[
                        styles.metricVal,
                        {
                          color:
                            signal.kind === "unexpected_increase"
                              ? "#10b981"
                              : colors.destructive,
                        },
                      ]}
                    />
                  ) : (
                    <Text style={[styles.metricAlertText, { color: colors.destructive }]}>
                      Not Detected
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionsRow}>
              {signal.kind === "unexpected_increase" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onReclassifySignal?.(signal)}
                >
                  Tag as Bonus
                </Button>
              ) : signal.kind === "missing_paycheck" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onAddManualPaycheck?.(signal)}
                >
                  Add Paycheck
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => onReviewSignal?.(signal)}
                >
                  Review Paycheck
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setDismissingSignal(signal);
                  setSelectedReason("false_alarm");
                }}
              >
                Dismiss
              </Button>
            </View>
          </View>
        );
      })}

      {/* ── Dismissal Reason Modal ────────────────────────────────────────── */}
      <Modal
        visible={Boolean(dismissingSignal)}
        transparent
        animationType="fade"
        onRequestClose={() => setDismissingSignal(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDismissingSignal(null)}
        >
          <Pressable
            style={[
              styles.modalDialog,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Dismiss Salary Signal
              </Text>
              <Pressable onPress={() => setDismissingSignal(null)} hitSlop={8}>
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Help us tune your salary intelligence. Why are you dismissing this alert?
            </Text>

            <View style={styles.reasonsList}>
              {SALARY_SIGNAL_DISMISSAL_REASONS.map((reasonKey) => {
                const isSelected = selectedReason === reasonKey;
                return (
                  <Pressable
                    key={reasonKey}
                    style={[
                      styles.reasonOption,
                      {
                        backgroundColor: isSelected
                          ? surfaces.control
                          : surfaces.tile,
                        borderColor: isSelected
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedReason(reasonKey)}
                  >
                    <View
                      style={[
                        styles.radioCircle,
                        {
                          borderColor: isSelected
                            ? colors.primary
                            : colors.mutedForeground,
                          backgroundColor: isSelected
                            ? colors.primary
                            : "transparent",
                        },
                      ]}
                    >
                      {isSelected ? <Check size={12} color="#ffffff" /> : null}
                    </View>
                    <Text
                      style={[
                        styles.reasonLabel,
                        {
                          color: isSelected
                            ? colors.foreground
                            : colors.mutedForeground,
                          fontWeight: isSelected ? "600" : "400",
                        },
                      ]}
                    >
                      {SALARY_SIGNAL_DISMISSAL_LABELS[reasonKey]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.modalButtonsRow}>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setDismissingSignal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onPress={handleConfirmDismiss}
              >
                Confirm Dismissal
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SignalIcon({
  kind,
  severity,
}: {
  kind: SalarySignalKind;
  severity: SalarySignalSeverity;
}) {
  const color = getSeverityColor(severity);
  const size = 18;

  switch (kind) {
    case "late_paycheck":
      return <Clock size={size} color={color} />;
    case "missing_paycheck":
      return <AlertTriangle size={size} color={color} />;
    case "partial_pay":
      return <TrendingDown size={size} color={color} />;
    case "unexpected_decrease":
      return <TrendingDown size={size} color={color} />;
    case "unexpected_increase":
      return <TrendingUp size={size} color="#10b981" />;
    default:
      return <AlertCircle size={size} color={color} />;
  }
}

function SeverityBadge({ severity }: { severity: SalarySignalSeverity }) {
  if (severity === "warning") {
    return (
      <View style={[styles.badgeBase, { backgroundColor: "rgba(239, 68, 68, 0.12)" }]}>
        <Text style={[styles.badgeText, { color: "#ef4444" }]}>Action Needed</Text>
      </View>
    );
  }

  if (severity === "attention") {
    return (
      <View style={[styles.badgeBase, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
        <Text style={[styles.badgeText, { color: "#f59e0b" }]}>Check Timing</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badgeBase, { backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
      <Text style={[styles.badgeText, { color: "#3b82f6" }]}>Notice</Text>
    </View>
  );
}

function getSeverityColor(severity: SalarySignalSeverity): string {
  if (severity === "warning") return "#ef4444";
  if (severity === "attention") return "#f59e0b";
  return "#3b82f6";
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  emptyContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  emptyText: {
    fontSize: 12,
    textAlign: "center",
  },
  signalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
  },
  headerTextGroup: {
    flex: 1,
    gap: 2,
  },
  signalTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  signalSubtitle: {
    fontSize: 12,
  },
  badgeBase: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  descriptionText: {
    fontSize: 12,
    lineHeight: 16,
  },
  metricTile: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    justifyContent: "space-around",
  },
  metricItem: {
    alignItems: "center",
    gap: 2,
  },
  metricDivider: {
    width: 1,
    height: 24,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  metricVal: {
    fontSize: 14,
    fontWeight: "700",
  },
  metricMuted: {
    fontSize: 14,
    fontWeight: "600",
  },
  metricAlertText: {
    fontSize: 13,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    paddingTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalDialog: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  reasonsList: {
    gap: 6,
    paddingVertical: 4,
  },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  reasonLabel: {
    fontSize: 13,
    flex: 1,
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
  },
});
