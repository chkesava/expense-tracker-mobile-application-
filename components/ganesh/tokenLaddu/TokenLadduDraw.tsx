import { useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Sparkles, Trophy } from "lucide-react-native";

import { MetricGrid } from "@/components/ganesh/MetricGrid";
import {
  GaneshEmptyState,
  MetaLabel,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { newId } from "@/lib/id";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";
import type { TokenDrawSession } from "@/shared/types/ganeshTokenLaddu";
import {
  drawRefusalMessage,
  type DrawResponse,
} from "@/shared/utils/ganeshDrawRemote";
import { readDrawReadiness } from "@/shared/utils/ganeshTokenLaddu";

export type TokenLadduDrawProps = {
  session: TokenDrawSession | null;
  configuredTokens: number;
  eligibleCount: number;
  completedDraws: number;
  canRun: boolean;
  isOnline: boolean;
  onOpenSession: (input: { clientOpId: string }) => Promise<unknown>;
  onDraw: (sessionId: string) => Promise<DrawResponse>;
  onCloseSession: (input: { sessionId: string; reason: string }) => Promise<unknown>;
};

/**
 * The draw, run one winner at a time.
 *
 * Deliberately not a "draw all" button. Nimarjanam is a live event: a number is
 * read out, people react, and then the next one is drawn. Committing them in a
 * batch would also make a mid-way failure much harder to reason about.
 *
 * Nothing here decides a winner. The server does, and this renders what it
 * says — including a refusal, which is a legitimate outcome rather than an
 * error when the pot runs dry.
 */
export function TokenLadduDraw({
  session,
  configuredTokens,
  eligibleCount,
  completedDraws,
  canRun,
  isOnline,
  onOpenSession,
  onDraw,
  onCloseSession,
}: TokenLadduDrawProps) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<DrawResponse | null>(null);
  const opIdRef = useRef(newId());

  const plannedDraws = session?.plannedDraws ?? configuredTokens;
  const readiness = readDrawReadiness({
    plannedDraws,
    completedDraws,
    eligibleCount,
    sessionStatus: session?.status,
  });

  const start = () => {
    setBusy(true);
    onOpenSession({ clientOpId: opIdRef.current })
      .catch((error) => {
        logError("ganesh.tokenDraw.open", error);
        toast.error(friendlyErrorMessage(error, "Could not start the draw."));
      })
      .finally(() => setBusy(false));
  };

  const confirmStart = () => {
    Alert.alert(
      "Start the draw?",
      `This fixes the draw at ${plannedDraws} ${plannedDraws === 1 ? "winner" : "winners"}. The number cannot be changed once it starts.`,
      [
        { text: "Not yet", style: "cancel" },
        { text: "Start", style: "destructive", onPress: start },
      ]
    );
  };

  const draw = () => {
    if (!session) return;
    setBusy(true);
    onDraw(session.id)
      .then((result) => {
        setLast(result);
        if (result.refusal) toast.error(drawRefusalMessage(result.refusal));
      })
      .catch((error) => {
        logError("ganesh.tokenDraw.run", error, { sequence: completedDraws + 1 });
        toast.error(friendlyErrorMessage(error, "Could not run the draw."));
      })
      .finally(() => setBusy(false));
  };

  const end = () => {
    if (!session) return;
    Alert.alert(
      "End the draw?",
      "Winners already drawn stay recorded. No further draws can be run in this session.",
      [
        { text: "Keep going", style: "cancel" },
        {
          text: "End",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            onCloseSession({ sessionId: session.id, reason: "Ended by the committee" })
              .catch((error) => {
                logError("ganesh.tokenDraw.close", error);
                toast.error(friendlyErrorMessage(error, "Could not end the draw."));
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  if (!canRun) {
    return (
      <GaneshEmptyState
        icon={<Trophy size={26} color={g.saffron} strokeWidth={2} />}
        title="Only the committee runs the draw"
        description="Your role can see the Token Laddus and the winners, but not run the Nimarjanam draw."
      />
    );
  }

  if (!session) {
    return (
      <Section title="The draw" icon={<Sparkles size={18} color={g.saffron} strokeWidth={2.2} />}>
        <Text style={[styles.lead, { color: theme.colors.mutedForeground }]}>
          At Nimarjanam, the draw picks one winning Token Laddu at a time. The number of draws is the
          number of Token Laddus set up for this festival.
        </Text>
        <MetricGrid
          items={[
            { label: "Draws planned", value: String(configuredTokens) },
            { label: "In the draw", value: String(eligibleCount) },
          ]}
        />
        {eligibleCount < configuredTokens ? (
          <StatusStrip
            tone="warning"
            message={`Only ${eligibleCount} of ${configuredTokens} Token Laddus are registered. The draw will stop when they run out.`}
          />
        ) : null}
        {!isOnline ? (
          <StatusStrip tone="warning" message="The draw needs a connection. Winners are recorded on the server." />
        ) : null}
        <Button
          loading={busy}
          disabled={configuredTokens <= 0 || eligibleCount === 0 || !isOnline}
          onPress={confirmStart}
        >
          Start the draw
        </Button>
      </Section>
    );
  }

  return (
    <View style={styles.wrap}>
      {last?.winner ? (
        <Section
          title={`Draw ${last.winner.sequence}`}
          icon={<Trophy size={18} color={g.saffron} strokeWidth={2.2} />}
        >
          <View style={[styles.winner, { backgroundColor: g.wash(g.saffron), borderColor: g.saffron }]}>
            <MetaLabel>Winning Token Laddu</MetaLabel>
            <Text style={[styles.code, { color: g.saffron, fontFamily: theme.fontFamily.bold }]}>
              {last.winner.tokenId}
            </Text>
            <Text style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
              {last.winner.participantName}
            </Text>
            <MetaLabel>
              Receipt {last.winner.receiptNumberPhysical}
              {last.winner.mobile ? ` · ${last.winner.mobile}` : ""}
            </MetaLabel>
          </View>
        </Section>
      ) : null}

      <Section title="The draw" icon={<Sparkles size={18} color={g.saffron} strokeWidth={2.2} />}>
        <MetricGrid
          items={[
            { label: "Draws done", value: String(completedDraws) },
            { label: "Draws left", value: String(readiness.remainingDraws) },
            { label: "In the draw", value: String(eligibleCount) },
            { label: "Planned", value: String(plannedDraws) },
          ]}
        />
        {readiness.shortfall && readiness.canDraw ? (
          <StatusStrip
            tone="warning"
            message={`Only ${eligibleCount} Token ${eligibleCount === 1 ? "Laddu is" : "Laddus are"} left for ${readiness.remainingDraws} draws. The draw will stop when they run out.`}
          />
        ) : null}
        {last?.refusal ? (
          <StatusStrip tone="warning" message={drawRefusalMessage(last.refusal)} />
        ) : null}
        {!isOnline ? (
          <StatusStrip tone="warning" message="The draw needs a connection. Winners are recorded on the server." />
        ) : null}
        {readiness.canDraw ? (
          <Button loading={busy} disabled={!isOnline} onPress={draw}>
            {completedDraws === 0 ? "Draw the first winner" : "Draw the next winner"}
          </Button>
        ) : (
          <StatusStrip tone="muted" message={readiness.blockedReason ?? "The draw is finished."} />
        )}
        {session.status === "open" ? (
          <Button variant="secondary" disabled={busy} onPress={end}>
            End the draw
          </Button>
        ) : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  lead: { fontSize: 13, lineHeight: 19 },
  winner: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 16,
    gap: 4,
    alignItems: "center",
  },
  code: { fontSize: 30, letterSpacing: -0.5 },
  name: { fontSize: 17 },
});
