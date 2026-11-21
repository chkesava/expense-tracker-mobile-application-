/**
 * SPENDLY-798 (epic SPENDLY-793): how many days before a debit to start
 * low-balance alerts. With `defaultLeadDays` it offers "Default (N days)" for
 * an item that follows the user's setting (`null`). Without it, it is the
 * setting itself.
 */

import { Text, View } from "react-native";

import { ChipRow } from "@/components/settings/SettingsControls";
import { LOW_BALANCE_LEAD_DAY_OPTIONS } from "@/shared/utils/lowBalanceAlerts";
import { useTheme } from "@/theme/ThemeProvider";

const daysLabel = (n: number) => (n === 1 ? "1 day" : `${n} days`);

export function LeadDaysChips({
  label,
  helper,
  value,
  defaultLeadDays,
  onChange,
}: {
  /** Leave out when the form draws its own label. */
  label?: string;
  helper?: string;
  /** The stored choice; null follows the default. */
  value: number | null;
  /** Shown as the "Default" option; leave out for the setting itself. */
  defaultLeadDays?: number;
  onChange: (value: number | null) => void;
}) {
  const { theme } = useTheme();
  const choices: number[] = [...LOW_BALANCE_LEAD_DAY_OPTIONS];
  // A value set elsewhere (e.g. 2 or 10) stays visible and selected.
  if (value !== null && !choices.includes(value)) choices.push(value);
  choices.sort((a, b) => a - b);
  const options = [
    ...(defaultLeadDays !== undefined ? [{ value: "default", label: `Default (${daysLabel(defaultLeadDays)})` }] : []),
    ...choices.map((n) => ({ value: String(n), label: daysLabel(n) })),
  ];
  const selected = value === null ? (defaultLeadDays !== undefined ? "default" : String(LOW_BALANCE_LEAD_DAY_OPTIONS[1])) : String(value);

  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: theme.colors.foreground, fontWeight: "600", fontSize: theme.typography.sm }}>{label}</Text> : null}
      {helper ? <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.xs }}>{helper}</Text> : null}
      <ChipRow<string> options={options} selected={selected} onSelect={(v) => onChange(v === "default" ? null : Number(v))} />
    </View>
  );
}
