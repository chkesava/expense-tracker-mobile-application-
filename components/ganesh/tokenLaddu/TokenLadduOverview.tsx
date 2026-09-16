import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Settings2, Ticket } from "lucide-react-native";

import { MetricGrid } from "@/components/ganesh/MetricGrid";
import {
  GaneshEmptyState,
  MetaLabel,
  Money,
  ProgressTrack,
  Section,
  SectionAction,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useTheme } from "@/theme/ThemeProvider";
import type { TokenCapacity } from "@/shared/utils/ganeshTokenLaddu";
import type { TokenLadduConfig } from "@/shared/types/ganeshTokenLaddu";

export type TokenLadduOverviewProps = {
  config: TokenLadduConfig;
  configured: boolean;
  capacity: TokenCapacity;
  /** Money actually collected, from the token rows. */
  collected: number;
  /** Counts by payment method, for the breakdown. */
  byMethod: Array<{ label: string; count: number; amount: number }>;
  completedDraws: number;
  winners: number;
  canConfigure: boolean;
  canRegister: boolean;
  onRegister: () => void;
  onSaveCapacity: (input: { totalTokens: number; amountPerToken: number; reason?: string }) => Promise<unknown>;
};

/**
 * The dashboard, and the configuration that feeds it.
 *
 * Capacity sits here rather than behind a separate screen because it is the
 * first step of the lifecycle and the number every other figure is measured
 * against — reading "registered 120" is meaningless without "of 500" beside it.
 */
export function TokenLadduOverview({
  config,
  configured,
  capacity,
  collected,
  byMethod,
  completedDraws,
  winners,
  canConfigure,
  canRegister,
  onRegister,
  onSaveCapacity,
}: TokenLadduOverviewProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState(String(config.totalTokens || ""));
  const [perToken, setPerToken] = useState(String(config.amountPerToken || ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reducing = Number(total || 0) < capacity.total;
  const pct = capacity.total > 0 ? (capacity.registered / capacity.total) * 100 : 0;

  const save = () => {
    setBusy(true);
    void onSaveCapacity({
      totalTokens: Number(total || 0),
      amountPerToken: Number(perToken || 0),
      reason: reason.trim() || undefined,
    })
      .then(() => {
        setEditing(false);
        setReason("");
      })
      .finally(() => setBusy(false));
  };

  const confirmSave = () => {
    if (!reducing) {
      save();
      return;
    }
    // Reducing capacity also reduces the number of draws, so it changes what
    // was promised to people who already hold a token.
    Alert.alert(
      "Reduce Token Laddus?",
      `This also reduces the draw to ${Number(total || 0)} winners.`,
      [
        { text: "Keep", style: "cancel" },
        { text: "Reduce", style: "destructive", onPress: save },
      ]
    );
  };

  if (!configured && !editing) {
    return (
      <GaneshEmptyState
        icon={<Ticket size={26} color={g.saffron} strokeWidth={2} />}
        title="No Token Laddus set up yet"
        description="Set how many Token Laddus the pandal has. That number is also how many winners the Nimarjanam draw will pick."
        action={
          canConfigure
            ? { label: "Set Token Laddus", onPress: () => setEditing(true) }
            : undefined
        }
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Section
        title="This festival"
        icon={<Ticket size={18} color={g.saffron} strokeWidth={2.2} />}
        action={
          canConfigure && !editing ? (
            <SectionAction label="Edit" onPress={() => setEditing(true)} />
          ) : undefined
        }
      >
        <MetricGrid
          items={[
            { label: "Token Laddus", value: String(capacity.total) },
            { label: "Registered", value: String(capacity.registered) },
            { label: "Left to register", value: String(capacity.remaining) },
            { label: "Collected", value: collected },
          ]}
        />
        <View style={styles.progress}>
          <ProgressTrack pct={pct} color={g.saffron} />
          <MetaLabel>
            {capacity.registered} of {capacity.total} registered
          </MetaLabel>
        </View>
        {capacity.full ? (
          <StatusStrip
            tone="warning"
            message="Every Token Laddu is registered. Raise the number to register more."
          />
        ) : capacity.remaining <= 10 && capacity.remaining > 0 ? (
          <StatusStrip
            tone="warning"
            message={`Only ${capacity.remaining} Token ${capacity.remaining === 1 ? "Laddu" : "Laddus"} left to register.`}
          />
        ) : null}
        {canRegister && !capacity.full ? (
          <Button onPress={onRegister}>Register a Token Laddu</Button>
        ) : null}
      </Section>

      {editing ? (
        <Section
          title="Token Laddu setup"
          icon={<Settings2 size={18} color={g.saffron} strokeWidth={2.2} />}
        >
          <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
            The number of Token Laddus is also the number of draws at Nimarjanam.
          </Text>
          <Input
            label="Number of Token Laddus"
            keyboardType="number-pad"
            value={total}
            onChangeText={setTotal}
            placeholder="500"
          />
          <Input
            label="Amount per Token Laddu"
            keyboardType="decimal-pad"
            value={perToken}
            onChangeText={setPerToken}
            placeholder="100"
            helperText="Leave blank if the price varies."
          />
          {reducing ? (
            <Input
              label="Reason for reducing"
              value={reason}
              onChangeText={setReason}
              placeholder="Only 200 laddus were made"
            />
          ) : null}
          <View style={styles.actions}>
            <Button variant="secondary" onPress={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button loading={busy} onPress={confirmSave}>
              Save
            </Button>
          </View>
        </Section>
      ) : null}

      <Section title="The draw">
        <MetricGrid
          items={[
            { label: "Draws planned", value: String(capacity.total) },
            { label: "Draws done", value: String(completedDraws) },
            { label: "Draws left", value: String(Math.max(0, capacity.total - completedDraws)) },
            { label: "Winners", value: String(winners) },
          ]}
        />
        <MetaLabel>
          {capacity.eligible} Token {capacity.eligible === 1 ? "Laddu is" : "Laddus are"} still in the
          draw
        </MetaLabel>
      </Section>

      {byMethod.length > 0 ? (
        <Section title="How it was paid">
          {byMethod.map((row) => (
            <View key={row.label} style={styles.methodRow}>
              <Text style={[styles.methodLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
                {row.label}
              </Text>
              <MetaLabel>
                {row.count} {row.count === 1 ? "token" : "tokens"}
              </MetaLabel>
              <Money value={row.amount} size="secondary" />
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  progress: { gap: 6, marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 8 },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 6,
  },
  methodLabel: { fontSize: 14, flex: 1 },
});
