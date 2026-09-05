import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CircleStop, Play } from "lucide-react-native";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { StatusBadge, useGaneshTokens } from "@/components/ganesh/ui";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useMyOpenSession } from "@/hooks/useCollectionSessions";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { sessionStatusLabel } from "@/shared/utils/ganeshSessionDisplay";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * The collector's own session, on the screen where they record collections
 * (GS-076).
 *
 * A session is the accountability trail for the cash one collector is carrying,
 * so it belongs where they are actually working rather than behind a menu. It
 * shows what the session has taken so far, because the handover figure they are
 * about to declare should be an informed number, not a guess.
 *
 * Renders nothing for a role that does not run sessions.
 */
export function GaneshSessionBar() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push } = useRouter();
  const { can } = useGaneshPermissions();
  const writes = useGaneshWrites();
  const { session } = useMyOpenSession();

  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [declared, setDeclared] = useState("");

  if (!can("sessions.write")) return null;

  const start = () => {
    setBusy(true);
    writes
      .startCollectionSession()
      .catch((error) => {
        logError("ganesh.startSession", error);
        toast.error(friendlyErrorMessage(error, "Could not start the session."));
      })
      .finally(() => setBusy(false));
  };

  const close = () => {
    if (!session) return;
    const amount = Number(declared);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter the cash you are handing over as 0 or more.");
      return;
    }
    Alert.alert(
      "Close this session?",
      `You are declaring ${formatInr(amount)} in cash. A treasurer will count it, and you cannot record more collections in this session afterwards.`,
      [
        { text: "Keep collecting", style: "cancel" },
        {
          text: "Close and hand over",
          onPress: () => {
            setBusy(true);
            writes
              .closeCollectionSession(session.id, { declaredCash: amount })
              .then(() => {
                setClosing(false);
                setDeclared("");
              })
              .catch((error) => {
                logError("ganesh.closeSession", error);
                toast.error(friendlyErrorMessage(error, "Could not close the session."));
              })
              .finally(() => setBusy(false));
          },
        },
      ]
    );
  };

  if (!session) {
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.divider }]}>
        <Text
          style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        >
          Not collecting yet
        </Text>
        <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
          Start a session so the cash you collect today is tracked as one handover.
        </Text>
        <Button variant="outline" loading={busy} onPress={start}>
          Start collecting
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: g.saffron }]}>
      <View style={styles.row}>
        <Text
          style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        >
          Collecting now
        </Text>
        <StatusBadge kind="promised" label={sessionStatusLabel(session.status)} />
      </View>
      <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
        Every collection you record joins this session until you close it. Streets do not need
        separate sessions.
      </Text>

      {closing ? (
        <>
          <Input
            label="Cash you are handing over"
            value={declared}
            onChangeText={setDeclared}
            keyboardType="numeric"
          />
          {/* Deliberately no pre-filled expected figure. Typing what you are
              actually holding is the point of the declaration; showing the
              ledger total first would just be asking people to agree with it. */}
          <Button loading={busy} onPress={close}>
            Close and hand over
          </Button>
          <Pressable onPress={() => setClosing(false)}>
            <Text style={[styles.link, { color: theme.colors.mutedForeground }]}>Keep collecting</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.actions}>
          <Button variant="outline" onPress={() => setClosing(true)}>
            Finish and hand over
          </Button>
          <Pressable onPress={() => push(`/(ganesh)/session/${session.id}`)}>
            <Text style={[styles.link, { color: g.saffron }]}>View session</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderCurve: "continuous",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { fontSize: 15 },
  meta: { fontSize: 13, lineHeight: 19 },
  actions: { gap: 8 },
  link: { fontSize: 13.5, paddingVertical: 4 },
});
