import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AlertTriangle, ChevronRight, Info } from "lucide-react-native";

import { Modal } from "@/components/common/Modal";
import { Section } from "@/components/dashboard/primitives";
import { FeeRecordRow } from "@/components/fees/FeeRecordRow";
import { Button } from "@/components/ui/Button";
import type { FeeRecord } from "@/shared/types/fee";
import type { FeeSignal, FeeSignalDismissal } from "@/shared/utils/feeAnomalies";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

type SignalActions = {
  busyId: string | null;
  dismiss: (signal: FeeSignal, resolution: "dismissed" | "resolved") => Promise<boolean>;
};

/** One signal row (SPENDLY-319). Icon + title + text, never colour alone. */
export function FeeSignalRow({ signal, onPress }: { signal: FeeSignal; onPress: () => void }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const attention = signal.severity === "attention";
  const Icon = attention ? AlertTriangle : Info;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${attention ? "Needs attention" : "For your information"}: ${signal.title}. ${signal.detail}`}
      style={({ pressed }) => [styles.row, { gap: theme.space.md, backgroundColor: pressed ? surfaces.tile : "transparent", borderRadius: theme.radius.md }]}
    >
      <Icon size={18} color={attention ? theme.colors.warning : theme.colors.info} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>{signal.title}</Text>
        <Text numberOfLines={2} style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          {signal.detail}
        </Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

/** Explanation, supporting records and dismiss / resolve for one signal. */
export function FeeSignalSheet({
  signal,
  records,
  currency,
  accountNames,
  actions,
  onClose,
  onOpenRecord,
}: {
  signal: FeeSignal | null;
  records: readonly FeeRecord[];
  currency: string;
  accountNames: Map<string, string>;
  actions: SignalActions;
  onClose: () => void;
  onOpenRecord: (record: FeeRecord) => void;
}) {
  const { theme } = useTheme();
  const byKey = useMemo(() => new Map(records.map((r) => [r.key, r] as const)), [records]);
  const act = (resolution: "dismissed" | "resolved") => {
    if (!signal) return;
    void actions.dismiss(signal, resolution).then((ok) => ok && onClose());
  };

  return (
    <Modal isOpen={Boolean(signal)} onClose={onClose} title={signal?.title} density="compact">
      {signal ? (
        <View style={{ gap: theme.space.lg }}>
          <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm }}>{signal.detail}</Text>
          <View style={{ gap: theme.space.xs }}>
            <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Based on
            </Text>
            <View style={{ marginHorizontal: -theme.space.lg }}>
              {signal.recordKeys.map((key) => {
                const record = byKey.get(key);
                if (!record) return null;
                return (
                  <FeeRecordRow
                    key={key}
                    record={record}
                    currency={currency}
                    accountName={record.source.accountId ? accountNames.get(record.source.accountId) : undefined}
                    selecting={false}
                    selected={false}
                    onPress={(r) => {
                      onClose();
                      onOpenRecord(r);
                    }}
                    onLongPress={() => undefined}
                  />
                );
              })}
            </View>
          </View>
          {signal.severity === "attention" ? (
            <View style={{ gap: theme.space.sm }}>
              <Button variant="primary" loading={actions.busyId === signal.id} disabled={Boolean(actions.busyId)} onPress={() => act("resolved")}>
                Mark as resolved
              </Button>
              <Button variant="outline" disabled={Boolean(actions.busyId)} onPress={() => act("dismissed")}>
                Not a problem — dismiss
              </Button>
            </View>
          ) : (
            <Button variant="outline" disabled={Boolean(actions.busyId)} onPress={() => act("dismissed")}>
              Hide this
            </Button>
          )}
          <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
            Spendly never edits or deletes your transactions because of a signal.
          </Text>
        </View>
      ) : null}
    </Modal>
  );
}

/** Overview section: active signals, plus a way to bring dismissed ones back. */
export function FeeSignalsSection({
  active,
  dismissed,
  records,
  currency,
  accountNames,
  actions,
  restore,
  onOpenRecord,
}: {
  active: FeeSignal[];
  dismissed: FeeSignalDismissal[];
  records: readonly FeeRecord[];
  currency: string;
  accountNames: Map<string, string>;
  actions: SignalActions;
  restore: (id: string) => Promise<void>;
  onOpenRecord: (record: FeeRecord) => void;
}) {
  const { theme } = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const open = openId ? active.find((s) => s.id === openId) ?? null : null;

  if (active.length === 0 && dismissed.length === 0) return null;

  return (
    <>
      <Section title="Worth a look" subtitle="Possible duplicates, unusual amounts and reversals">
        <View style={{ gap: theme.space.xs }}>
          {active.length === 0 ? (
            <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
              Nothing needs a look right now.
            </Text>
          ) : null}
          {active.slice(0, 6).map((s) => (
            <FeeSignalRow key={s.id} signal={s} onPress={() => setOpenId(s.id)} />
          ))}
          {dismissed.length > 0 ? (
            <Button variant="ghost" size="sm" onPress={() => setShowDismissed((v) => !v)}>
              {showDismissed ? "Hide dismissed" : `Show dismissed (${dismissed.length})`}
            </Button>
          ) : null}
          {showDismissed
            ? dismissed.map((d) => (
                <View key={d.id} style={[styles.dismissed, { gap: theme.space.sm }]}>
                  <Text style={{ flex: 1, color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
                    {d.resolution === "resolved" ? "Resolved" : "Dismissed"} · {d.kind.replace(/_/g, " ")} · {new Date(d.atMs).toLocaleDateString()}
                  </Text>
                  <Button variant="text" size="sm" disabled={Boolean(actions.busyId)} onPress={() => void restore(d.id)}>
                    Restore
                  </Button>
                </View>
              ))
            : null}
        </View>
      </Section>
      <FeeSignalSheet
        signal={open}
        records={records}
        currency={currency}
        accountNames={accountNames}
        actions={actions}
        onClose={() => setOpenId(null)}
        onOpenRecord={onOpenRecord}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingVertical: 6, paddingHorizontal: 4 },
  dismissed: { flexDirection: "row", alignItems: "center", minHeight: 44 },
});
