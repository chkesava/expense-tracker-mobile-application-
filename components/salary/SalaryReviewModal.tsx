import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertCircle,
  Building,
  Calendar,
  CheckCircle2,
  FileText,
  Info,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useSettings } from "@/providers/SettingsProvider";
import type {
  SalaryCandidate,
  SalaryComponentBreakdown,
  SalaryRecord,
  SalaryRejectionReason,
  SalaryReview,
  SalaryType,
} from "@/shared/features/salary/types";
import {
  SALARY_REJECTION_REASONS,
  SALARY_TYPES,
} from "@/shared/features/salary/types";
import type {
  SalaryConfirmOverrides,
  SalaryRecordCorrection,
} from "@/shared/features/salary/utils/review";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface SalaryReviewModalProps {
  isOpen: boolean;
  candidate: SalaryCandidate | null;
  existingRecord?: SalaryRecord;
  existingReview?: SalaryReview;
  onClose: () => void;
  onConfirm: (
    candidate: SalaryCandidate,
    overrides?: SalaryConfirmOverrides
  ) => void;
  onReject: (
    candidate: SalaryCandidate,
    reason: SalaryRejectionReason
  ) => void;
  onCorrect?: (
    record: SalaryRecord,
    correction: SalaryRecordCorrection
  ) => void;
  saving?: boolean;
}

export function SalaryReviewModal({
  isOpen,
  candidate,
  existingRecord,
  existingReview,
  onClose,
  onConfirm,
  onReject,
  onCorrect,
  saving = false,
}: SalaryReviewModalProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  const [activeTab, setActiveTab] = useState<"summary" | "edit" | "reject">(
    "summary"
  );

  // Edit / Override fields
  const [employerName, setEmployerName] = useState("");
  const [payPeriodMonth, setPayPeriodMonth] = useState("");
  const [salaryType, setSalaryType] = useState<SalaryType>("regular");
  const [grossAmount, setGrossAmount] = useState("");
  const [basicPay, setBasicPay] = useState("");
  const [hra, setHra] = useState("");
  const [epf, setEpf] = useState("");
  const [tds, setTds] = useState("");
  const [professionalTax, setProfessionalTax] = useState("");
  const [notes, setNotes] = useState("");

  // Rejection reason
  const [rejectionReason, setRejectionReason] =
    useState<SalaryRejectionReason>("not_salary");

  useEffect(() => {
    if (candidate) {
      setEmployerName(
        existingRecord?.employer.name || candidate.employer.name || ""
      );
      setPayPeriodMonth(
        existingRecord?.payPeriod.month || candidate.payPeriod.month || ""
      );
      setSalaryType(
        existingRecord?.type || candidate.suggestedType || "regular"
      );
      setGrossAmount(
        existingRecord?.grossAmount !== null &&
          existingRecord?.grossAmount !== undefined
          ? String(existingRecord.grossAmount)
          : ""
      );
      setBasicPay(
        existingRecord?.breakdown?.allowances?.basic !== undefined
          ? String(existingRecord.breakdown.allowances.basic)
          : ""
      );
      setHra(
        existingRecord?.breakdown?.allowances?.hra !== undefined
          ? String(existingRecord.breakdown.allowances.hra)
          : ""
      );
      setEpf(
        existingRecord?.breakdown?.deductions?.epf !== undefined
          ? String(existingRecord.breakdown.deductions.epf)
          : ""
      );
      setTds(
        existingRecord?.breakdown?.deductions?.tds !== undefined
          ? String(existingRecord.breakdown.deductions.tds)
          : ""
      );
      setProfessionalTax(
        existingRecord?.breakdown?.deductions?.professionalTax !== undefined
          ? String(existingRecord.breakdown.deductions.professionalTax)
          : ""
      );
      setNotes(existingRecord?.notes || "");
      setActiveTab("summary");
    }
  }, [candidate, existingRecord]);

  if (!candidate) return null;

  const isConfirmed =
    existingRecord?.status === "confirmed" ||
    existingReview?.decision === "confirm";
  const isCorrected = existingRecord?.provenance.source === "user_corrected";
  const isRejected = existingReview?.decision === "reject";

  const handleQuickConfirm = () => {
    onConfirm(candidate);
  };

  const handleSaveWithOverrides = () => {
    const grossNum = grossAmount.trim() ? parseFloat(grossAmount) : undefined;
    const basicNum = basicPay.trim() ? parseFloat(basicPay) : undefined;
    const hraNum = hra.trim() ? parseFloat(hra) : undefined;
    const epfNum = epf.trim() ? parseFloat(epf) : undefined;
    const tdsNum = tds.trim() ? parseFloat(tds) : undefined;
    const ptNum = professionalTax.trim()
      ? parseFloat(professionalTax)
      : undefined;

    let breakdown: SalaryComponentBreakdown | undefined = undefined;
    if (
      grossNum !== undefined ||
      basicNum !== undefined ||
      hraNum !== undefined ||
      epfNum !== undefined ||
      tdsNum !== undefined ||
      ptNum !== undefined
    ) {
      breakdown = {
        grossSalary: grossNum,
        netSalary: candidate.amount,
        allowances: {
          basic: basicNum,
          hra: hraNum,
        },
        deductions: {
          epf: epfNum,
          tds: tdsNum,
          professionalTax: ptNum,
        },
      };
    }

    const overrides: SalaryConfirmOverrides = {
      employerName: employerName.trim() || undefined,
      payPeriodMonth: payPeriodMonth.trim() || undefined,
      salaryType,
      grossAmount: grossNum,
      breakdown,
      notes: notes.trim() || undefined,
    };

    if (existingRecord && onCorrect) {
      onCorrect(existingRecord, {
        employer: { name: overrides.employerName || existingRecord.employer.name },
        payPeriod: { month: overrides.payPeriodMonth || existingRecord.month },
        month: overrides.payPeriodMonth || existingRecord.month,
        grossAmount: overrides.grossAmount,
        salaryType: overrides.salaryType,
        breakdown: overrides.breakdown,
        notes: overrides.notes,
      });
    } else {
      onConfirm(candidate, overrides);
    }
  };

  const handleReject = () => {
    onReject(candidate, rejectionReason);
  };

  const confidenceBadge = (
    <View
      style={[
        styles.badge,
        {
          backgroundColor:
            candidate.confidence === "high"
              ? colors.success + "20"
              : candidate.confidence === "medium"
              ? colors.primary + "20"
              : colors.mutedForeground + "20",
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          {
            color:
              candidate.confidence === "high"
                ? colors.success
                : candidate.confidence === "medium"
                ? colors.primary
                : colors.mutedForeground,
          },
        ]}
      >
        {candidate.confidence.toUpperCase()} CONFIDENCE
      </Text>
    </View>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isConfirmed
          ? "Salary Paycheck"
          : isRejected
          ? "Excluded Transaction"
          : "Review Salary Credit"
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header Card */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.summaryTopRow}>
              <View style={styles.employerRow}>
                <Building size={20} color={colors.primary} />
                <Text style={[styles.employerTitle, { color: colors.foreground }]}>
                  {employerName || candidate.employer.name}
                </Text>
              </View>
              {confidenceBadge}
            </View>

            <View style={styles.amountRow}>
              <Text style={[styles.netLabel, { color: colors.mutedForeground }]}>
                Net Pay Credited
              </Text>
              <Amount
                ghostable
                value={candidate.amount}
                currency="INR"
                style={[styles.amountValue, { color: colors.foreground }]}
              />
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Calendar size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  {formatDisplayDate(candidate.date, settings?.dateFormat)}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <FileText size={14} color={colors.mutedForeground} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  Wage Month: {payPeriodMonth || candidate.payPeriod.month}
                </Text>
              </View>
            </View>

            {candidate.rawNarration ? (
              <View
                style={[
                  styles.narrationBox,
                  { backgroundColor: surfaces.tile },
                ]}
              >
                <Text
                  style={[
                    styles.narrationText,
                    { color: colors.mutedForeground },
                  ]}
                  numberOfLines={2}
                >
                  {candidate.rawNarration}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabsRow}>
            <Chip
              label="Overview"
              selected={activeTab === "summary"}
              onPress={() => setActiveTab("summary")}
              tone="primary"
            />
            <Chip
              label="Edit Details"
              selected={activeTab === "edit"}
              onPress={() => setActiveTab("edit")}
              tone="primary"
            />
            <Chip
              label="Not Salary"
              selected={activeTab === "reject"}
              onPress={() => setActiveTab("reject")}
              tone="destructive"
            />
          </View>

          {/* TAB 1: SUMMARY / OVERVIEW */}
          {activeTab === "summary" && (
            <View style={styles.tabSection}>
              {/* Evidence Section */}
              <View style={styles.evidenceSection}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  Recognition Signals
                </Text>
                {candidate.evidence.map((sig, idx) => (
                  <View key={idx} style={styles.signalRow}>
                    <CheckCircle2
                      size={14}
                      color={colors.success}
                      style={styles.signalIcon}
                    />
                    <Text
                      style={[styles.signalText, { color: colors.mutedForeground }]}
                    >
                      {sig}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Provenance / History Section */}
              {existingRecord?.provenance?.originalValues && isCorrected && (
                <View
                  style={[
                    styles.historyBox,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.historyHeader}>
                    <Info size={14} color={colors.primary} />
                    <Text
                      style={[styles.historyTitle, { color: colors.primary }]}
                    >
                      Correction History
                    </Text>
                  </View>
                  <Text
                    style={[styles.historyText, { color: colors.mutedForeground }]}
                  >
                    Originally detected as: ₹
                    {existingRecord.provenance.originalValues.netAmount?.toLocaleString(
                      "en-IN"
                    )}{" "}
                    from{" "}
                    {existingRecord.provenance.originalValues.employerName} (
                    {existingRecord.provenance.originalValues.month})
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionsColumn}>
                <Button
                  onPress={handleQuickConfirm}
                  disabled={saving}
                  style={styles.confirmButton}
                >
                  {isConfirmed ? "Confirmed ✓" : "Confirm Salary"}
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setActiveTab("edit")}
                  disabled={saving}
                >
                  Edit & Add Breakdown
                </Button>
              </View>
            </View>
          )}

          {/* TAB 2: EDIT & CORRECT */}
          {activeTab === "edit" && (
            <View style={styles.tabSection}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Employer & Pay Period
              </Text>
              <Input
                label="Employer Name"
                value={employerName}
                onChangeText={setEmployerName}
                placeholder="e.g. Acme Technologies"
              />
              <Input
                label="Wage Month (YYYY-MM)"
                value={payPeriodMonth}
                onChangeText={setPayPeriodMonth}
                placeholder="2026-10"
              />

              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.foreground, marginTop: 12 },
                ]}
              >
                Payment Classification
              </Text>
              <View style={styles.typeChipsWrap}>
                {SALARY_TYPES.map((t) => (
                  <Chip
                    key={t}
                    label={t.replace("_", " ").toUpperCase()}
                    selected={salaryType === t}
                    onPress={() => setSalaryType(t)}
                    size="sm"
                  />
                ))}
              </View>

              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.foreground, marginTop: 12 },
                ]}
              >
                Salary Breakdown (Optional)
              </Text>
              <Input
                label="Gross Salary (₹)"
                keyboardType="numeric"
                value={grossAmount}
                onChangeText={setGrossAmount}
                placeholder="Total Gross before deductions"
              />
              <View style={styles.splitRow}>
                <View style={styles.splitCol}>
                  <Input
                    label="Basic Pay (₹)"
                    keyboardType="numeric"
                    value={basicPay}
                    onChangeText={setBasicPay}
                    placeholder="e.g. 60000"
                  />
                </View>
                <View style={styles.splitCol}>
                  <Input
                    label="HRA (₹)"
                    keyboardType="numeric"
                    value={hra}
                    onChangeText={setHra}
                    placeholder="e.g. 25000"
                  />
                </View>
              </View>

              <View style={styles.splitRow}>
                <View style={styles.splitCol}>
                  <Input
                    label="Employee EPF (₹)"
                    keyboardType="numeric"
                    value={epf}
                    onChangeText={setEpf}
                    placeholder="e.g. 7200"
                  />
                </View>
                <View style={styles.splitCol}>
                  <Input
                    label="TDS Tax (₹)"
                    keyboardType="numeric"
                    value={tds}
                    onChangeText={setTds}
                    placeholder="e.g. 15000"
                  />
                </View>
              </View>

              <Input
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Received with bonus"
              />

              <View style={styles.actionsColumn}>
                <Button onPress={handleSaveWithOverrides} disabled={saving}>
                  Save & Confirm Changes
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setActiveTab("summary")}
                >
                  Cancel
                </Button>
              </View>
            </View>
          )}

          {/* TAB 3: REJECT / NOT SALARY */}
          {activeTab === "reject" && (
            <View style={styles.tabSection}>
              <View style={styles.rejectNotice}>
                <AlertCircle size={20} color={colors.destructive} />
                <Text style={[styles.rejectNoticeText, { color: colors.foreground }]}>
                  Marking as "Not Salary" removes this transaction from your
                  salary records and prevents it from appearing in future scans.
                </Text>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Reason for Exclusion
              </Text>
              <View style={styles.reasonsList}>
                {SALARY_REJECTION_REASONS.map((r) => (
                  <Chip
                    key={r}
                    label={r.replace("_", " ").toUpperCase()}
                    selected={rejectionReason === r}
                    onPress={() => setRejectionReason(r)}
                    tone="destructive"
                  />
                ))}
              </View>

              <View style={styles.actionsColumn}>
                <Button
                  variant="destructive"
                  onPress={handleReject}
                  disabled={saving}
                >
                  Exclude Transaction
                </Button>
                <Button
                  variant="outline"
                  onPress={() => setActiveTab("summary")}
                >
                  Back
                </Button>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 640,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  employerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  employerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  amountRow: {
    marginBottom: 12,
  },
  netLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 26,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 13,
  },
  narrationBox: {
    padding: 10,
    borderRadius: 8,
  },
  narrationText: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  tabSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  evidenceSection: {
    gap: 8,
    marginBottom: 8,
  },
  signalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  signalIcon: {
    marginTop: 2,
  },
  signalText: {
    fontSize: 13,
    flex: 1,
  },
  historyBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  historyText: {
    fontSize: 12,
  },
  actionsColumn: {
    gap: 10,
    marginTop: 12,
  },
  confirmButton: {
    width: "100%",
  },
  typeChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  splitRow: {
    flexDirection: "row",
    gap: 12,
  },
  splitCol: {
    flex: 1,
  },
  rejectNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FEE2E220",
    marginBottom: 8,
  },
  rejectNoticeText: {
    fontSize: 13,
    flex: 1,
  },
  reasonsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
});
