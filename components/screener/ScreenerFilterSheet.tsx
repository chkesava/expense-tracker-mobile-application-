import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Lock } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { SheetActions } from "@/components/common/SheetActions";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import type { ScreenerRowDTO } from "@/shared/types/market";
import {
  SCREENER_FIELDS,
  sectorsIn,
  validateScreen,
  type NumericFieldId,
  type RangeFilter,
  type Screen,
  type ScreenError,
} from "@/shared/utils/screener";
import { boundToInput, rangeFromInputs } from "@/shared/utils/screenerView";
import { useTheme } from "@/theme/ThemeProvider";

type Bounds = Record<string, { min: string; max: string }>;

function boundsFrom(screen: Screen): Bounds {
  const out: Bounds = {};
  for (const r of screen.ranges) out[r.field] = { min: boundToInput(r.min), max: boundToInput(r.max) };
  return out;
}

/**
 * Edit every filter at once (SPENDLY-651). Changes are a draft until "Show
 * results"; the draft is validated by the engine and errors are shown on the
 * field they belong to. Market cap, P/E and volume are shown disabled with the
 * reason they can't be used.
 */
export function ScreenerFilterSheet({
  isOpen,
  onClose,
  screen,
  rows,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  screen: Screen;
  rows: readonly ScreenerRowDTO[];
  onApply: (screen: Screen) => void;
}) {
  const { theme } = useTheme();
  const [bounds, setBounds] = useState<Bounds>(() => boundsFrom(screen));
  const [sectors, setSectors] = useState<string[]>(screen.sectors);
  const [nifty50Only, setNifty50Only] = useState(screen.nifty50Only);
  const [errors, setErrors] = useState<ScreenError[]>([]);

  // Each opening starts from the screen as it is now.
  useEffect(() => {
    if (!isOpen) return;
    setBounds(boundsFrom(screen));
    setSectors(screen.sectors);
    setNifty50Only(screen.nifty50Only);
    setErrors([]);
  }, [isOpen, screen]);

  const sectorList = useMemo(() => sectorsIn(rows), [rows]);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  const setBound = (field: NumericFieldId, key: "min" | "max", text: string) =>
    setBounds((prev) => ({ ...prev, [field]: { min: prev[field]?.min ?? "", max: prev[field]?.max ?? "", [key]: text } }));

  const toggleSector = (sector: string) =>
    setSectors((prev) => (prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]));

  const apply = () => {
    const ranges: RangeFilter[] = [];
    for (const field of SCREENER_FIELDS) {
      if (!field.available) continue;
      const b = bounds[field.id];
      const range = b ? rangeFromInputs(field.id as NumericFieldId, b.min, b.max) : null;
      if (range) ranges.push(range);
    }
    const result = validateScreen({ ...screen, ranges, sectors, nifty50Only });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onApply(result.screen);
  };

  const clearAll = () => {
    setBounds({});
    setSectors([]);
    setNifty50Only(false);
    setErrors([]);
  };

  const muted = theme.colors.mutedForeground;
  const small = { color: muted, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.regular };
  const heading = { color: theme.colors.foreground, fontSize: theme.typography.sm, fontFamily: theme.fontFamily.semibold };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
      maxHeight="90%"
      density="compact"
      footer={<SheetActions primary={{ label: "Show results", onPress: apply }} secondary={{ label: "Clear all", onPress: clearAll }} />}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.toggleRow}>
          <View style={styles.flex}>
            <Text style={heading}>NIFTY 50 only</Text>
            <Text style={small}>Only the 50 largest stocks.</Text>
          </View>
          <Switch value={nifty50Only} onValueChange={setNifty50Only} accessibilityLabel="NIFTY 50 only" />
        </View>

        {SCREENER_FIELDS.map((field) =>
          field.available ? (
            <View key={field.id} style={styles.field}>
              <Text style={heading}>
                {field.label} {field.unit === "percent" ? "(%)" : "(₹)"}
              </Text>
              <Text style={small}>{field.description}</Text>
              <View style={styles.inputs}>
                <Input
                  placeholder="Min"
                  value={bounds[field.id]?.min ?? ""}
                  onChangeText={(t) => setBound(field.id as NumericFieldId, "min", t)}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={`${field.label} minimum`}
                  containerStyle={styles.flex}
                />
                <Input
                  placeholder="Max"
                  value={bounds[field.id]?.max ?? ""}
                  onChangeText={(t) => setBound(field.id as NumericFieldId, "max", t)}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={`${field.label} maximum`}
                  containerStyle={styles.flex}
                />
              </View>
              {errorFor(field.id) ? (
                <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.xs, fontFamily: theme.fontFamily.medium }}>
                  {errorFor(field.id)}
                </Text>
              ) : null}
            </View>
          ) : (
            <View key={field.id} style={[styles.field, styles.disabled]} accessible accessibilityLabel={`${field.label}. ${field.unavailableReason}`}>
              <View style={styles.toggleRow}>
                <Lock size={14} color={muted} />
                <Text style={[heading, { color: muted }]}>{field.label}</Text>
              </View>
              <Text style={small}>{field.unavailableReason}</Text>
            </View>
          )
        )}

        <View style={styles.field}>
          <Text style={heading}>Sector</Text>
          <Text style={small}>NSE's industry classification. None selected means every sector.</Text>
          <View style={styles.chips}>
            {sectorList.map(({ sector, count }) => (
              <Chip
                key={sector}
                label={`${sector} (${count})`}
                size="sm"
                appearance="tonal"
                selected={sectors.includes(sector)}
                onPress={() => toggleSector(sector)}
                accessibilityLabel={`${sector}, ${count} stocks`}
              />
            ))}
          </View>
          {errorFor("sectors") ? <Text style={{ color: theme.colors.destructive, fontSize: theme.typography.xs }}>{errorFor("sectors")}</Text> : null}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18, paddingBottom: 12 },
  field: { gap: 6 },
  disabled: { opacity: 0.6 },
  inputs: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
