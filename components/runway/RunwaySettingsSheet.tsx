import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { ChipRow, RowSwitch } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { BaselineMethod, BaselineWindow } from "@/shared/utils/runwayBaseline";
import {
  RUNWAY_MAX_THRESHOLD_AMOUNT,
  RUNWAY_MAX_THRESHOLD_MONTHS,
  normalizeRunwaySettings,
  type RunwaySettings,
  type RunwayThresholdKind,
} from "@/shared/utils/runwaySettings";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Runway assumptions the user controls (SPENDLY-210): the reserve threshold,
 * the history window and method, unusual expenses and the projection length.
 */
export function RunwaySettingsSheet({
  isOpen,
  settings,
  saving,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  settings: RunwaySettings;
  saving: boolean;
  onClose: () => void;
  onSave: (next: RunwaySettings) => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(settings);
  const [amountText, setAmountText] = useState(String(settings.thresholdAmount || ""));
  const [monthsText, setMonthsText] = useState(String(settings.thresholdMonths));

  useEffect(() => {
    if (!isOpen) return;
    setDraft(settings);
    setAmountText(settings.thresholdAmount ? String(settings.thresholdAmount) : "");
    setMonthsText(String(settings.thresholdMonths));
  }, [isOpen, settings]);

  const amount = Number(amountText.replace(/,/g, ""));
  const months = Number(monthsText);
  const amountError =
    draft.thresholdKind === "amount" && (!Number.isFinite(amount) || amount < 0 || amount > RUNWAY_MAX_THRESHOLD_AMOUNT) ? "Enter an amount of zero or more" : undefined;
  const monthsError =
    draft.thresholdKind === "essential_months" && (!Number.isFinite(months) || months < 0 || months > RUNWAY_MAX_THRESHOLD_MONTHS)
      ? `Enter 0 to ${RUNWAY_MAX_THRESHOLD_MONTHS} months`
      : undefined;
  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  const save = () => {
    if (amountError || monthsError) return;
    onSave(
      normalizeRunwaySettings({
        ...draft,
        thresholdAmount: draft.thresholdKind === "amount" ? amount : draft.thresholdAmount,
        thresholdMonths: draft.thresholdKind === "essential_months" ? months : draft.thresholdMonths,
      })
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Runway settings" density="compact">
      <View style={{ gap: theme.space.md }}>
        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Minimum reserve</Text>
          <Text style={hint}>Runway is measured down to this amount, not to zero. A planning indicator, not advice.</Text>
          <ChipRow<RunwayThresholdKind>
            options={[
              { value: "none", label: "None" },
              { value: "amount", label: "Fixed amount" },
              { value: "essential_months", label: "Months of essentials" },
            ]}
            selected={draft.thresholdKind}
            onSelect={(v) => setDraft({ ...draft, thresholdKind: v })}
          />
          {draft.thresholdKind === "amount" ? (
            <Input label="Reserve amount" keyboardType="numeric" value={amountText} onChangeText={setAmountText} error={amountError} />
          ) : null}
          {draft.thresholdKind === "essential_months" ? (
            <Input
              label="Months of essential spending"
              keyboardType="numeric"
              value={monthsText}
              onChangeText={setMonthsText}
              error={monthsError}
              helperText="For example 1 keeps one month of essentials in reserve"
            />
          ) : null}
        </View>

        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>History used for typical spending</Text>
          <ChipRow<string>
            options={[
              { value: "3", label: "3 months" },
              { value: "6", label: "6 months" },
              { value: "12", label: "12 months" },
            ]}
            selected={String(draft.windowMonths)}
            onSelect={(v) => setDraft({ ...draft, windowMonths: Number(v) as BaselineWindow })}
          />
          <ChipRow<BaselineMethod>
            options={[
              { value: "average", label: "Average" },
              { value: "median", label: "Median" },
            ]}
            selected={draft.method}
            onSelect={(v) => setDraft({ ...draft, method: v })}
          />
          <Text style={hint}>Median is less affected by one unusually heavy month.</Text>
        </View>

        <RowSwitch
          label="Include unusually large one-offs"
          description="Off: a single expense bigger than two typical months is left out of typical spending."
          value={draft.includeUnusual}
          onValueChange={(v) => setDraft({ ...draft, includeUnusual: v })}
        />

        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Project ahead</Text>
          <ChipRow<string>
            options={[
              { value: "6", label: "6 months" },
              { value: "12", label: "12 months" },
              { value: "24", label: "24 months" },
            ]}
            selected={String(draft.projectionMonths)}
            onSelect={(v) => setDraft({ ...draft, projectionMonths: Number(v) })}
          />
        </View>

        <Button onPress={save} loading={saving} disabled={Boolean(amountError || monthsError)}>
          Save settings
        </Button>
      </View>
    </Modal>
  );
}
