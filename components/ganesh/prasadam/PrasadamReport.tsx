import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  FilterChips,
  MetaLabel,
  Section,
  StatStrip,
  StatTile,
  useGaneshTokens,
  type ChipOption,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import type { PrasadamEntry } from "@/shared/types/ganeshPrasadam";
import type { PrasadamExport } from "@/shared/utils/ganeshPrasadamExport";
import { prasadamExportRows } from "@/shared/utils/ganeshPrasadamExport";
import { prasadamSessionLabel } from "@/shared/utils/ganeshPrasadam";
import { formatSevaDate } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

type Range = "day" | "festival";

const PREVIEW_ROWS = 10;

/**
 * Export the register, with a preview of exactly what will be in it.
 *
 * The preview is built from the *same* `buildPrasadamExport` that produces the
 * file, so the two can never disagree — which is the whole reason the financial
 * report screen previews before exporting rather than asking people to trust a
 * button.
 */
export function PrasadamReport({
  entries,
  activeDate,
  buildModel,
  onExportPdf,
  onExportCsv,
  exporting,
}: {
  entries: readonly PrasadamEntry[];
  activeDate: string;
  buildModel: (scoped: PrasadamEntry[], filterSummary?: string) => PrasadamExport;
  onExportPdf: (model: PrasadamExport) => void;
  onExportCsv: (model: PrasadamExport) => void;
  exporting?: boolean;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const [range, setRange] = useState<Range>("festival");

  const options: Array<ChipOption<Range>> = [
    { id: "festival", label: "Whole festival", badge: entries.length },
    {
      id: "day",
      label: "This day",
      badge: entries.filter((e) => e.date === activeDate).length,
    },
  ];

  const model = useMemo(() => {
    const scoped =
      range === "day" ? entries.filter((e) => e.date === activeDate) : [...entries];
    return buildModel(
      scoped,
      range === "day" ? `${formatSevaDate(activeDate, true)} only` : undefined
    );
  }, [range, entries, activeDate, buildModel]);

  const rows = prasadamExportRows(model);
  const preview = rows.slice(0, PREVIEW_ROWS);

  const quantities = model.totals.byUnit
    .map((total) => `${total.quantity} ${total.unitLabel ?? total.unit}`)
    .join(" · ");

  return (
    <View style={{ gap: 12 }}>
      <FilterChips value={range} options={options} onChange={setRange} />

      <Section title="What the report contains">
        <StatStrip>
          <StatTile label="Days">
            <Value>{model.totals.days}</Value>
          </StatTile>
          <StatTile label="Providers">
            <Value>{model.totals.providerCount}</Value>
          </StatTile>
          <StatTile label="Entries">
            <Value>{model.totals.entryCount}</Value>
          </StatTile>
        </StatStrip>

        {quantities ? <MetaLabel>{quantities}</MetaLabel> : null}

        {preview.length > 0 ? (
          <View style={{ gap: 4, marginTop: 4 }}>
            {preview.map((row) => (
              <View
                key={row.entryId}
                style={[styles.previewRow, { borderBottomColor: g.divider }]}
              >
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, color: theme.colors.foreground, fontSize: 12.5 }}
                >
                  {formatSevaDate(row.date)} · {prasadamSessionLabel(row.session)} ·{" "}
                  {row.providerName}
                </Text>
                <Text
                  style={{ color: theme.colors.mutedForeground, fontSize: 12.5 }}
                >
                  {row.quantity}
                </Text>
              </View>
            ))}
            {rows.length > preview.length ? (
              <MetaLabel>and {rows.length - preview.length} more rows</MetaLabel>
            ) : null}
          </View>
        ) : (
          <MetaLabel>Nothing recorded in this range yet.</MetaLabel>
        )}
      </Section>

      <Button
        loading={exporting}
        disabled={rows.length === 0}
        onPress={() => onExportPdf(model)}
      >
        Export PDF
      </Button>
      <Button
        variant="secondary"
        disabled={exporting || rows.length === 0}
        onPress={() => onExportCsv(model)}
      >
        Export CSV
      </Button>
      <MetaLabel>
        Every provider appears on their own line. Quantities are listed per unit and
        never added across units.
      </MetaLabel>
    </View>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.foreground,
        fontFamily: theme.fontFamily.semibold,
        fontSize: 20,
        fontVariant: ["tabular-nums"],
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
