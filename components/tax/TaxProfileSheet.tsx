import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Chip } from "@/components/ui/Chip";
import {
  TAX_AGE_BANDS,
  TAX_RESIDENTIAL_STATUSES,
  type FinancialYearKey,
  type TaxAgeBand,
  type TaxProfile,
  type TaxResidentialStatus,
} from "@/shared/features/tax/types";
import { taxYearLabel } from "@/shared/features/tax/utils/taxYear";
import { useTheme } from "@/theme/ThemeProvider";

export const RESIDENTIAL_STATUS_LABELS: Record<TaxResidentialStatus, string> = {
  resident: "Resident",
  rnor: "Resident but not ordinarily resident",
  non_resident: "Non-resident",
  unknown: "Not sure",
};

export const AGE_BAND_LABELS: Record<TaxAgeBand, string> = {
  below_60: "Below 60",
  "60_to_79": "60 to 79",
  "80_plus": "80 or older",
  unknown: "Prefer not to say",
};

/**
 * The two facts the estimate needs about the user for one year (SPENDLY-295):
 * residential status and an age band. An age band, never a date of birth.
 */
export function TaxProfileSheet({
  open,
  fy,
  profile,
  saving,
  onSave,
  onClose,
}: {
  open: boolean;
  fy: FinancialYearKey;
  profile: TaxProfile | null;
  saving: boolean;
  onSave: (values: { residentialStatus: TaxResidentialStatus; ageBand: TaxAgeBand }) => Promise<boolean>;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [status, setStatus] = useState<TaxResidentialStatus>("unknown");
  const [age, setAge] = useState<TaxAgeBand>("unknown");
  useEffect(() => {
    if (!open) return;
    setStatus(profile?.residentialStatus ?? "unknown");
    setAge(profile?.ageBand ?? "unknown");
  }, [open, profile]);

  if (!open) return null;
  const heading = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  const group = <T extends string>(label: string, ids: readonly T[], labels: Record<T, string>, value: T, set: (v: T) => void, helper: string) => (
    <View style={{ gap: theme.space.sm }}>
      <Text style={heading}>{label}</Text>
      <View style={[styles.wrap, { gap: theme.space.sm }]} accessibilityRole="radiogroup">
        {ids.map((id) => (
          <Chip key={id} label={labels[id]} selected={value === id} onPress={() => set(id)} appearance="outline" size="sm" accessibilityRole="radio" />
        ))}
      </View>
      <Text style={muted}>{helper}</Text>
    </View>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Your details for this year"
      density="compact"
      footer={
        <SheetActions
          secondary={{ label: "Cancel", onPress: onClose }}
          primary={{
            label: "Save",
            loading: saving,
            disabled: saving,
            onPress: () => void onSave({ residentialStatus: status, ageBand: age }).then((ok) => ok && onClose()),
          }}
        />
      }
    >
      <View style={{ gap: theme.space.lg }}>
        <Text style={muted}>For {taxYearLabel(fy)}. Used only to pick the right slabs and limits.</Text>
        {group("Residential status", TAX_RESIDENTIAL_STATUSES, RESIDENTIAL_STATUS_LABELS, status, setStatus, "Most people living in India all year are residents.")}
        {group("Age during the year", TAX_AGE_BANDS, AGE_BAND_LABELS, age, setAge, "Changes the old regime's slabs and some deduction limits.")}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap" },
});
