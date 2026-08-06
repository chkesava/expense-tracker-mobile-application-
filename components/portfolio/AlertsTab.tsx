import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, Plus, Trash2 } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { alertSchema } from "@/shared/features/portfolio/schemas";
import type { AlertCondition, PriceAlert } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";

const CONDITIONS: { id: AlertCondition; label: string }[] = [
  { id: "price_above", label: "Price above" },
  { id: "price_below", label: "Price below" },
  { id: "profit_above", label: "Profit above %" },
  { id: "loss_above", label: "Loss above %" },
];

export interface AlertsTabProps {
  alerts: PriceAlert[];
  onAdd: (alert: Omit<PriceAlert, "id" | "createdAt" | "isActive" | "triggeredAt">) => Promise<boolean>;
  onToggle: (id: string, isActive: boolean) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function AlertsTab({ alerts, onAdd, onToggle, onDelete }: AlertsTabProps) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("");
  const [condition, setCondition] = useState<AlertCondition>("price_above");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const parsed = alertSchema.safeParse({
      symbol: normalizedSymbol,
      yahooSymbol: normalizedSymbol.endsWith(".NS") || normalizedSymbol.endsWith(".BO") ? normalizedSymbol : `${normalizedSymbol}.NS`,
      name: name.trim() || normalizedSymbol,
      condition,
      threshold: Number(threshold),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid alert");
      return;
    }
    if (await onAdd(parsed.data)) {
      setSymbol("");
      setName("");
      setThreshold("");
      setError(null);
      setShowForm(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Bell size={18} color={theme.colors.primary} />
          <Text style={[styles.title, { color: theme.colors.foreground }]}>Price alerts</Text>
        </View>
        <Button size="sm" onPress={() => setShowForm((visible) => !visible)}>
          <Plus size={15} color={theme.colors.primaryForeground} />
          <Text style={{ color: theme.colors.primaryForeground, fontWeight: "700" }}>New</Text>
        </Button>
      </View>

      {showForm ? (
        <View style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Input label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" placeholder="e.g. RELIANCE" />
          <Input label="Name (optional)" value={name} onChangeText={setName} placeholder="Reliance Industries" />
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Condition</Text>
          <View style={styles.conditionGrid}>
            {CONDITIONS.map((item) => {
              const active = item.id === condition;
              return (
                <Pressable key={item.id} onPress={() => setCondition(item.id)} style={[styles.condition, { backgroundColor: active ? theme.colors.primary : theme.colors.muted, borderColor: active ? theme.colors.primary : theme.colors.border }]}>
                  <Text style={{ color: active ? theme.colors.primaryForeground : theme.colors.foreground, fontWeight: "700", fontSize: 12 }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Input label={condition.includes("profit") || condition.includes("loss") ? "Threshold (%)" : "Price threshold"} value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" placeholder="0" error={error ?? undefined} />
          <Button onPress={add}>Create alert</Button>
        </View>
      ) : null}

      {alerts.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.colors.border }]}>
          <Bell size={32} color={theme.colors.mutedForeground} />
          <Text style={{ color: theme.colors.foreground, fontWeight: "800" }}>No alerts configured</Text>
          <Text style={{ color: theme.colors.mutedForeground, textAlign: "center" }}>Create an alert to track a price or P&L threshold.</Text>
        </View>
      ) : alerts.map((alert) => (
        <View key={alert.id} style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "800" }}>{alert.symbol}</Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              {CONDITIONS.find((item) => item.id === alert.condition)?.label} {alert.threshold}{alert.condition.includes("profit") || alert.condition.includes("loss") ? "%" : ""}
            </Text>
          </View>
          <Pressable onPress={() => void onToggle(alert.id, !alert.isActive)} style={[styles.status, { backgroundColor: alert.isActive ? "rgba(16,185,129,0.14)" : theme.colors.muted }]}>
            <Text style={{ color: alert.isActive ? "#059669" : theme.colors.mutedForeground, fontSize: 11, fontWeight: "800" }}>{alert.isActive ? "Active" : "Paused"}</Text>
          </Pressable>
          <Pressable onPress={() => void onDelete(alert.id)} hitSlop={10} style={styles.delete}><Trash2 size={16} color={theme.colors.destructive} /></Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "800" },
  form: { borderWidth: 1, borderRadius: 14, gap: 10, padding: 14 },
  label: { fontSize: 12, fontWeight: "700" },
  conditionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  condition: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  empty: { alignItems: "center", borderWidth: 1, borderRadius: 14, gap: 8, padding: 24 },
  item: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, gap: 10, padding: 12 },
  status: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  delete: { padding: 4 },
});
