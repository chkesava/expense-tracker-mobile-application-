import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { FileSpreadsheet, Upload, X } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { addHoldingSchema } from "@/shared/features/portfolio/schemas";
import type { Holding } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";

type CreateHoldingInput = Omit<Holding, "id" | "createdAt" | "updatedAt">;

export interface CsvImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (holdings: CreateHoldingInput[]) => Promise<boolean>;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseBrokerCsv(contents: string): CreateHoldingInput[] {
  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV must include a header and at least one holding.");
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const findValue = (cells: string[], possibilities: string[]) => {
    const index = headers.findIndex((header) => possibilities.some((candidate) => header.includes(candidate)));
    return index < 0 ? undefined : cells[index]?.trim();
  };

  const holdings: CreateHoldingInput[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const rawSymbol = findValue(cells, ["instrument", "symbol", "company", "scrip"]);
    const rawQuantity = findValue(cells, ["qty", "quantity", "shares"]);
    const rawPrice = findValue(cells, ["avg price", "average price", "buy price", "avg. price", "avg. cost"]);
    if (!rawSymbol || !rawQuantity || !rawPrice) {
      throw new Error(`Row ${index + 1} needs Symbol, Quantity, and Avg Price values.`);
    }

    const symbol = rawSymbol.replace(/\s+EQ$/i, "").trim().toUpperCase();
    const quantity = Number(rawQuantity.replace(/,/g, ""));
    const averageBuyPrice = Number(rawPrice.replace(/,/g, ""));
    const candidate = {
      symbol,
      yahooSymbol: symbol.endsWith(".NS") || symbol.endsWith(".BO") ? symbol : `${symbol}.NS`,
      name: symbol,
      exchange: "NSE" as const,
      instrumentType: "stock" as const,
      quantity,
      averageBuyPrice,
      datePurchased: todayKey(),
    };
    const parsed = addHoldingSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(`Row ${index + 1}: ${parsed.error.issues[0]?.message ?? "Invalid holding"}`);
    }
    holdings.push(parsed.data);
  }
  if (!holdings.length) throw new Error("No valid holdings were found in this CSV.");
  return holdings;
}

export function CsvImportModal({ visible, onClose, onImport }: CsvImportModalProps) {
  const { theme } = useTheme();
  const [fileName, setFileName] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<CreateHoldingInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setHoldings([]);
    setError(null);
    setImporting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const chooseFile = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    try {
      const asset = result.assets[0];
      if (!asset.name.toLowerCase().endsWith(".csv") && asset.mimeType !== "text/csv") {
        throw new Error("Choose a .csv file.");
      }
      const contents = new File(asset.uri).textSync();
      const parsedHoldings = parseBrokerCsv(contents);
      setFileName(asset.name);
      setHoldings(parsedHoldings);
    } catch (caught) {
      setHoldings([]);
      setFileName(null);
      setError(caught instanceof Error ? caught.message : "Unable to read that CSV file.");
    }
  };

  const importHoldings = async () => {
    if (!holdings.length) return;
    setImporting(true);
    const success = await onImport(holdings);
    setImporting(false);
    if (success) {
      toast.success(`Imported ${holdings.length} holdings`);
      close();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <FileSpreadsheet size={20} color={theme.colors.primary} />
              <Text style={[styles.title, { color: theme.colors.foreground }]}>Import holdings CSV</Text>
            </View>
            <Pressable onPress={close} hitSlop={12}><X size={22} color={theme.colors.foreground} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <Text style={[styles.copy, { color: theme.colors.mutedForeground }]}>
              Supports Groww and Zerodha-style CSVs with Symbol, Quantity, and Avg Price columns. Importing replaces current holdings only; transactions remain untouched.
            </Text>
            <Button variant="outline" onPress={chooseFile}>
              <Upload size={16} color={theme.colors.foreground} />
              <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>Choose CSV</Text>
            </Button>
            {error ? <Text style={[styles.error, { color: theme.colors.destructive }]}>{error}</Text> : null}
            {holdings.length ? (
              <View style={[styles.preview, { borderColor: theme.colors.border }]}>
                <Text style={[styles.previewTitle, { color: theme.colors.foreground }]}>{fileName} · {holdings.length} holdings ready</Text>
                {holdings.slice(0, 5).map((holding) => (
                  <View key={`${holding.symbol}-${holding.quantity}`} style={styles.previewRow}>
                    <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{holding.symbol}</Text>
                    <Text style={{ color: theme.colors.mutedForeground }}>{holding.quantity} @ {holding.averageBuyPrice.toFixed(2)}</Text>
                  </View>
                ))}
                {holdings.length > 5 ? <Text style={{ color: theme.colors.mutedForeground }}>+ {holdings.length - 5} more</Text> : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Button variant="ghost" onPress={close} style={{ flex: 1 }}>Cancel</Button>
            <Button onPress={importHoldings} loading={importing} disabled={!holdings.length} style={{ flex: 1 }}>Replace holdings</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 18, fontWeight: "800" },
  body: { gap: 14, paddingHorizontal: 20, paddingBottom: 20 },
  copy: { fontSize: 13, lineHeight: 19 },
  error: { fontSize: 13, lineHeight: 18 },
  preview: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  previewTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  footer: { flexDirection: "row", gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
