/**
 * SPENDLY-113 — the Journal's reports and export workspace.
 *
 * Replaces a placeholder that promised "Export, backup, and restore" and whose
 * two buttons routed to a Settings screen with no export UI on it.
 *
 * Presentational: every figure arrives as a prop, computed by
 * `buildJournalReport`. In particular the preview strip reads the *report's*
 * totals rather than the screen's, so what is previewed and what is written to
 * the file are the same object — the rule `DownloadStatementModal` follows.
 *
 * This sub-tab is the only one where `PageShell` owns the scroll, so there is
 * deliberately no `ScrollView` and no `FlashList` here. That is also the second
 * reason the preview is totals and filter chips rather than a table of rows.
 */

import { StyleSheet, Text, View } from "react-native";
import { Download, FileText, Printer } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import type { AccountActivityFilterChip } from "@/shared/utils/accountActivityFilterLabels";
import type { JournalReport } from "@/shared/utils/journalReport";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type JournalExportFormat = "csv" | "pdf";

export function JournalReportWorkspace({
  report,
  filterChips,
  searchQuery,
  exportAllowed,
  busy,
  onExport,
  onEditFilters,
  onClearFilters,
}: {
  /** Undefined while the ledger is still loading — exports stay paused. */
  report: JournalReport | undefined;
  /** The same chips the History tab shows, from the same function. */
  filterChips: AccountActivityFilterChip[];
  searchQuery: string;
  exportAllowed: boolean;
  busy: JournalExportFormat | null;
  onExport: (format: JournalExportFormat) => void;
  onEditFilters: () => void;
  onClearFilters: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const currency = useDisplayCurrency();

  const surface = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
  };

  if (!report) {
    return (
      <View style={styles.wrap}>
        <Heading />
        <View
          style={[styles.card, surface, { borderColor: theme.colors.warning }]}
        >
          <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>
            Exports paused
          </Text>
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Still loading your full history. Exports stay paused until it is all
            here, so a file can never be missing rows.
          </Text>
        </View>
      </View>
    );
  }

  const { totals } = report;
  const empty = report.rowCount === 0;

  return (
    <View style={styles.wrap}>
      <Heading />

      {/* What exactly is being exported. The filter bar is hidden on this
          sub-tab, so the dataset has to describe itself. */}
      <View style={[styles.card, surface]}>
        <Text style={[styles.count, { color: theme.colors.foreground }]}>
          {report.rowCount}{" "}
          {report.rowCount === 1 ? "transaction" : "transactions"}
        </Text>
        <Text style={[styles.scope, { color: theme.colors.mutedForeground }]}>
          {report.scopeLabel} · {report.period.label}
        </Text>

        {filterChips.length > 0 ? (
          <View style={styles.chips}>
            {filterChips.map((chip) => (
              <View
                key={chip.id}
                style={[
                  styles.chip,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.04)",
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: theme.colors.foreground }]}
                >
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            No filters — your whole {report.period.label}.
          </Text>
        )}

        {searchQuery ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Search: “{searchQuery}”
          </Text>
        ) : null}

        <Button variant="ghost" size="sm" onPress={onEditFilters}>
          Edit filters in History
        </Button>
      </View>

      {/* The preview is the report itself, so it cannot disagree with the file. */}
      {!empty ? (
        <View style={[styles.card, surface]}>
          <View style={styles.totalsRow}>
            <Total label="Spent" value={totals.spent} tone={theme.colors.destructive} />
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <Total label="Income" value={totals.income} tone={theme.colors.success} />
            <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            <Total
              label="Net"
              value={totals.net}
              tone={totals.net >= 0 ? theme.colors.success : theme.colors.destructive}
            />
          </View>
          {totals.cardSpent > 0 ? (
            <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
              Includes{" "}
              <Amount value={totals.cardSpent} currency={currency} ghostable />{" "}
              on cards, which has not left your accounts yet.
            </Text>
          ) : null}
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Net cash movement{" "}
            <Amount value={totals.netCash} currency={currency} ghostable />.
          </Text>
        </View>
      ) : null}

      {empty ? (
        <View style={[styles.card, surface]}>
          <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>
            Nothing to export in this view
          </Text>
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            No transactions match the current filters.
          </Text>
          {filterChips.length > 0 || searchQuery ? (
            <Button variant="ghost" size="sm" onPress={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </View>
      ) : !exportAllowed ? (
        <View style={[styles.card, surface]}>
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Data export is turned off for this account.
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            onPress={() => onExport("csv")}
            loading={busy === "csv"}
            disabled={busy !== null}
            style={styles.action}
          >
            <FileText size={16} color={theme.colors.primaryForeground} />
            {busy === "csv"
              ? `Exporting ${report.rowCount}…`
              : "Export CSV"}
          </Button>
          <Button
            variant="secondary"
            onPress={() => onExport("pdf")}
            loading={busy === "pdf"}
            disabled={busy !== null}
            style={styles.action}
          >
            <Printer size={16} color={theme.colors.foreground} />
            {busy === "pdf" ? `Preparing ${report.rowCount}…` : "Print / PDF"}
          </Button>
        </View>
      )}
    </View>
  );
}

function Heading() {
  const { theme } = useTheme();
  return (
    <View style={styles.heading}>
      <View style={styles.headingRow}>
        <Download size={16} color={theme.colors.mutedForeground} />
        <Text style={[styles.title, { color: theme.colors.foreground }]}>
          Reports & export
        </Text>
      </View>
      <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
        Everything below is the Journal&apos;s current view — the same rows,
        filters and period you left on the History tab.
      </Text>
    </View>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  const { theme } = useTheme();
  const currency = useDisplayCurrency();
  return (
    <View style={styles.totalCol}>
      <Text style={[styles.totalLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <Amount
        value={value}
        currency={currency}
        ghostable
        style={[styles.totalValue, { color: tone }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  heading: {
    gap: 4,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  count: {
    fontSize: 20,
    fontWeight: "800",
  },
  scope: {
    fontSize: 12,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  note: {
    fontSize: 11,
    lineHeight: 16,
  },
  totalsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalCol: {
    flex: 1,
    gap: 2,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  action: {
    flex: 1,
  },
});
