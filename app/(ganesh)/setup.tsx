import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { usePandals } from "@/hooks/usePandals";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshSetupScreen() {
  const { theme } = useTheme();
  const { replace } = useRouter();
  const { setSession } = useGaneshSession();
  const { pandals } = usePandals();
  const writes = useGaneshWrites();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [pandalName, setPandalName] = useState("");
  const [area, setArea] = useState("");
  const [festivalName, setFestivalName] = useState(`Ganesh Chaturthi ${new Date().getFullYear()}`);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const created = await writes.createPandalAndFestival({
        pandalName,
        area,
        festivalName,
        year: new Date().getFullYear(),
      });
      await setSession({ pandalId: created.pandalId, festivalId: created.festivalId });
      toast.success(`Pandal code ${created.code}`);
      replace("/(ganesh)" as never);
    } catch (error) {
      logError("ganesh.setup.create", error);
      toast.error(friendlyErrorMessage(error, "Could not create Pandal."));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await writes.requestPandalJoin(code);
      toast.success("Ask an admin to approve your request.");
      setMode("choose");
    } catch (error) {
      logError("ganesh.setup.join", error);
      toast.error(friendlyErrorMessage(error, "Could not request access."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.foreground, fontSize: 24, fontWeight: "800" }}>
        Ganesh Seva
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Create a Pandal or join with a code. Expense Tracker data never appears here.
      </Text>

      {pandals.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>My Pandals</Text>
          {pandals.map((pandal) => (
            <PandalPickRow
              key={pandal.id}
              pandalId={pandal.id}
              name={pandal.name}
              code={pandal.code}
            />
          ))}
        </View>
      ) : null}

      {mode === "choose" ? (
        <View style={{ gap: 10 }}>
          <Button onPress={() => setMode("create")}>Create Ganesh Pandal</Button>
          <Button variant="outline" onPress={() => setMode("join")}>
            Join with Pandal code
          </Button>
        </View>
      ) : null}

      {mode === "create" ? (
        <View style={{ gap: 12 }}>
          <Input label="Pandal name" value={pandalName} onChangeText={setPandalName} placeholder="Sri Ganesh Youth Committee" />
          <Input label="Area (optional)" value={area} onChangeText={setArea} />
          <Input label="Festival" value={festivalName} onChangeText={setFestivalName} />
          <Button loading={busy} onPress={() => void create()}>
            Create Pandal
          </Button>
          <Button variant="ghost" onPress={() => setMode("choose")}>
            Back
          </Button>
        </View>
      ) : null}

      {mode === "join" ? (
        <View style={{ gap: 12 }}>
          <Input
            label="Pandal code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="GNSH26"
          />
          <Button loading={busy} onPress={() => void join()}>
            Request access
          </Button>
          <Button variant="ghost" onPress={() => setMode("choose")}>
            Back
          </Button>
        </View>
      ) : null}
    </GaneshScreen>
  );
}

function PandalPickRow({
  pandalId,
  name,
  code,
}: {
  pandalId: string;
  name: string;
  code: string;
}) {
  const { theme } = useTheme();
  const { replace } = useRouter();
  const { setSession } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const openFestival = festivals.find((festival) => festival.status === "open") ?? festivals[0];

  return (
    <Pressable
      onPress={() => {
        if (!openFestival) {
          toast.error("This Pandal has no festival yet.");
          return;
        }
        void setSession({ pandalId, festivalId: openFestival.id }).then(() => {
          replace("/(ganesh)" as never);
        });
      }}
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>{name}</Text>
      <Text style={{ color: theme.colors.mutedForeground }}>Code {code}</Text>
      {openFestival ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{openFestival.name}</Text>
      ) : null}
    </Pressable>
  );
}
