import { appDialog } from "@/lib/appDialog";
import { logWarning } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { recomputeFdInterestRemote } from "@/services/investments/fdInterestRecomputeClient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Archive,
  Calendar,
  Pencil,
  Percent,
  Trash2,
} from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Pill } from "@/components/dashboard/primitives";
import { useInvestmentKindStyle } from "@/components/investments/investmentKind";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import {
  formatSignedPercent,
  investmentReturnPercent,
  investmentStatusDisplay,
} from "@/shared/utils/investmentPresentation";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { Investment, InterestCreditEvent } from "@/shared/types/investment";
import { todayDateKey } from "@/shared/utils/dates";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import { listInterestCredits } from "@/services/investments/interestCreditsStore";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

export interface InvestmentDetailModalProps {
  visible: boolean;
  investment: Investment | null;
  currency: string;
  onClose: () => void;
  onCloseInvestment: (id: string) => Promise<boolean>;
  onDeleteInvestment: (id: string) => Promise<boolean>;
  onUpdateInvestment: (id: string, updates: Partial<Investment>) => Promise<boolean>;
}

export function InvestmentDetailModal({
  visible,
  investment,
  currency,
  onClose,
  onCloseInvestment,
  onDeleteInvestment,
  onUpdateInvestment,
}: InvestmentDetailModalProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { settings } = useSettings();
  // Hooks run before the early return below; the kind is a placeholder
  // while no investment is selected.
  const kind = useInvestmentKindStyle(investment?.kind ?? "fixed_deposit");
  const date = (value: string) => formatDisplayDate(value, settings?.dateFormat);

  const today = todayDateKey();
  const valuation = useMemo(() => {
    if (!investment) return null;
    return getInvestmentValuation(investment, today);
  }, [investment, today]);

  // fd-interest-daily's credit log, loaded on demand (SPENDLY) -- a one-shot
  // read, not a listener, same reasoning as account notes.
  const [interestCredits, setInterestCredits] = useState<InterestCreditEvent[]>([]);
  const investmentId = investment?.id;
  const investmentMethod = investment?.interestMethod;
  const uid = user?.uid;
  // Guards against a slow, in-flight read from a previous investment (or a
  // previous call) landing after a newer one has already started/resolved.
  const requestIdRef = useRef(0);
  const refreshInterestCredits = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!uid || !investmentId || investmentMethod !== "compound") return;
    try {
      const events = await listInterestCredits(uid, investmentId);
      if (requestIdRef.current === requestId) setInterestCredits(events);
    } catch (error) {
      if (requestIdRef.current === requestId) {
        logWarning("investmentDetailModal.listInterestCredits", error);
      }
    }
  }, [uid, investmentId, investmentMethod]);

  useEffect(() => {
    // Cleared synchronously on every dependency change (not just the early
    // return below) so switching from one investment to another never shows
    // the previous investment's credits under the new one's title while the
    // new request is in flight.
    setInterestCredits([]);
    if (!visible) return;
    void refreshInterestCredits();
  }, [visible, refreshInterestCredits]);

  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateDraft, setRateDraft] = useState("");
  useEffect(() => {
    setIsEditingRate(false);
    setRateDraft(investment?.annualInterestRate !== undefined ? String(investment.annualInterestRate) : "");
  }, [investment?.id, investment?.annualInterestRate]);

  if (!investment || !valuation) return null;

  const isClosed = investment.status === "closed";
  const profit = valuation.totalValue - investment.principal;
  const returnPct = investmentReturnPercent(profit, investment.principal);
  const kindLabel = kind.label;
  const kindColor = kind.color;

  const handleDelete = () => {
    appDialog.alert(
      "Delete Investment",
      `Are you sure you want to delete "${investment.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await onDeleteInvestment(investment.id);
            onClose();
          },
        },
      ]
    );
  };

  const handleSaveRate = () => {
    const parsed = Number(rateDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setIsEditingRate(false);
      setRateDraft(investment.annualInterestRate !== undefined ? String(investment.annualInterestRate) : "");
      return;
    }
    appDialog.alert(
      "Change Interest Rate",
      "Changing the rate recalculates every previously credited day using the new rate. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            await onUpdateInvestment(investment.id, {
              annualInterestRate: parsed,
              lastInterestCreditedDate: null,
            });
            setIsEditingRate(false);
            try {
              const { creditedDays } = await recomputeFdInterestRemote(investment.id);
              await refreshInterestCredits();
              toast.success(
                creditedDays > 0
                  ? `Recalculated ${creditedDays} day${creditedDays === 1 ? "" : "s"}`
                  : "Rate updated"
              );
            } catch (error) {
              logWarning("investmentDetailModal.recomputeFdInterest", error);
              toast.error("Rate updated — the detailed history will catch up within a day");
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    appDialog.alert(
      "Maturity / Close Investment",
      `Mark "${investment.name}" as closed? It will remain in historical records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Closed",
          onPress: async () => {
            await onCloseInvestment(investment.id);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal isOpen={visible} onClose={onClose} title={investment.name} maxHeight="85%">
      {/* Identity */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: withAlpha(kindColor, 0.13) },
            ]}
          >
            <kind.Icon size={20} color={kindColor} />
          </View>
          <Text
            style={[styles.subtitle, { color: theme.colors.mutedForeground, flex: 1 }]}
            numberOfLines={2}
          >
            {kindLabel} · Started {date(investment.startDate)}
          </Text>
        </View>

        <Button
          variant="ghost"
          size="icon"
          onPress={handleDelete}
          accessibilityLabel="Delete investment"
        >
          <Trash2 size={18} color={theme.colors.destructive} />
        </Button>
      </View>

      {/* Big Valuation Card */}
      <Card style={styles.valuationCard}>
        <MetaLabel>Current value · as of today</MetaLabel>
        <FinancialAmount value={valuation.totalValue} currency={currency} size="xl" weight="bold" fit />

        <View
          style={[
            styles.subMetricsRow,
            { borderTopColor: theme.colors.border },
          ]}
        >
          <View style={styles.subMetric}>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Principal Invested
            </Text>
            <FinancialAmount value={investment.principal} currency={currency} size="sm" weight="semibold" />
          </View>

          <View style={[styles.subMetric, { alignItems: "flex-end" }]}>
            <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
              Accrued Gain / Interest
            </Text>
            {/* SPENDLY-542: this always printed "+", so a loss read "+INR -500". */}
            <FinancialAmount
              value={Math.round(profit)}
              currency={currency}
              size="sm"
              sign="auto"
              tone="auto"
              weight="semibold"
            />
            {returnPct !== null ? (
              <Text style={{ fontSize: 11, color: theme.colors.mutedForeground }}>
                {formatSignedPercent(returnPct)} on principal
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      {/* Terms & Configuration */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
          INVESTMENT SPECIFICATIONS
        </Text>

        <Card style={{ padding: 14 }}>
          <View style={styles.specs}>
            <View style={styles.specRow}>
              <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                Interest Rate
              </Text>
              {isEditingRate ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Input
                    value={rateDraft}
                    onChangeText={setRateDraft}
                    keyboardType="decimal-pad"
                    style={{ width: 80, height: 36, paddingVertical: 4 }}
                    autoFocus
                  />
                  <Button variant="ghost" size="sm" onPress={handleSaveRate} accessibilityLabel="Save interest rate">
                    Save
                  </Button>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                    {investment.annualInterestRate !== undefined
                      ? `${investment.annualInterestRate}% p.a.`
                      : "Market Linked"}
                  </Text>
                  {investment.kind !== "mutual_fund" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onPress={() => setIsEditingRate(true)}
                      accessibilityLabel="Edit interest rate"
                    >
                      <Pencil size={14} color={theme.colors.mutedForeground} />
                    </Button>
                  ) : null}
                </View>
              )}
            </View>

            {investment.interestMethod && (
              <View style={styles.specRow}>
                <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                  Calculation Method
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground, textTransform: "capitalize" }}>
                  {investment.interestMethod} ({investment.creditFrequency || "Quarterly"})
                </Text>
              </View>
            )}

            {investment.maturityDate && (
              <View style={styles.specRow}>
                <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                  Maturity Date
                </Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.foreground }}>
                  {date(investment.maturityDate)}
                </Text>
              </View>
            )}

            <View style={styles.specRow}>
              <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                Status
              </Text>
              <Pill label={investmentStatusDisplay(investment.status).label} tone={investmentStatusDisplay(investment.status).tone} />
            </View>
          </View>
        </Card>
      </View>

      {/* Interest Credits history (fd-interest-daily) */}
      {interestCredits.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
            INTEREST CREDITS
          </Text>
          <Card style={{ padding: 14 }}>
            <View style={styles.specs}>
              {interestCredits.map((event) => (
                <View key={event.date} style={styles.specRow}>
                  <Text style={{ fontSize: 13, color: theme.colors.mutedForeground }}>
                    {date(event.date)}
                  </Text>
                  <FinancialAmount value={event.amount} currency={currency} size="sm" weight="semibold" />
                </View>
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      {/* Footer Action */}
      {!isClosed && (
        <Button variant="outline" onPress={handleClose}>
          <Archive size={16} color={theme.colors.primary} />
          <Text style={{ marginLeft: 8, fontWeight: "700", color: theme.colors.primary }}>
            Mark as Matured / Closed
          </Text>
        </Button>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 12,
  },
  valuationCard: {
    padding: 18,
    borderRadius: 18,
    gap: 8,
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  subMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subMetric: {
    gap: 2,
  },
  section: {
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  specs: {
    gap: 12,
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
