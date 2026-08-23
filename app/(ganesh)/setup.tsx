import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FundLocationChips } from "@/components/ganesh/FundLocationChips";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useMyJoinRequests } from "@/hooks/useMyJoinRequests";
import { usePandals } from "@/hooks/usePandals";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import type { PermanentFundLocation } from "@/shared/types/ganesh";
import { validateFundTransfer, validateNonNegativeAmount } from "@/shared/utils/ganeshMath";
import { formatPandalCode } from "@/shared/utils/ganeshIdentity";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export default function GaneshSetupScreen() {
  const { theme } = useTheme();
  const { replace } = useRouter();
  const { setSession } = useGaneshSession();
  const { pandals } = usePandals();
  const { pending, rejected } = useMyJoinRequests();
  const writes = useGaneshWrites();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [pandalName, setPandalName] = useState("");
  const [area, setArea] = useState("");
  const [festivalName, setFestivalName] = useState(`Ganesh Chaturthi ${new Date().getFullYear()}`);
  const [code, setCode] = useState("");
  const [hasExistingFund, setHasExistingFund] = useState(false);
  const [initialAmount, setInitialAmount] = useState("");
  const [allocateAmount, setAllocateAmount] = useState("0");
  const [fundLocation, setFundLocation] = useState<PermanentFundLocation>("cash");
  const [fundDescription, setFundDescription] = useState("Money saved from previous years");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const initial = hasExistingFund ? Number(initialAmount || 0) : 0;
    const allocate = Number(allocateAmount || 0);
    if (hasExistingFund) {
      const initialOk = validateNonNegativeAmount(initial, "Existing Pandal fund");
      if (!initialOk.ok || initial <= 0) {
        toast.error("Enter the existing Permanent Fund amount, or choose No.");
        return;
      }
    }
    const allocateOk = validateNonNegativeAmount(allocate, "Festival opening from Permanent Fund");
    if (!allocateOk.ok) {
      toast.error(allocateOk.error);
      return;
    }
    if (allocate > 0) {
      const allowed = validateFundTransfer(allocate, initial, "Permanent Fund");
      if (!allowed.ok) {
        toast.error(allowed.error);
        return;
      }
    }
    setBusy(true);
    try {
      const created = await writes.createPandalAndFestival({
        pandalName,
        area,
        festivalName,
        year: new Date().getFullYear(),
        initialFund: initial > 0
          ? { amount: initial, location: fundLocation, description: fundDescription }
          : undefined,
        allocateToFestival: allocate > 0 ? { amount: allocate, location: fundLocation } : undefined,
      });
      await setSession({ pandalId: created.pandalId, festivalId: created.festivalId });
      toast.success(`Pandal code ${formatPandalCode(created.code)}`);
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
        Welcome to Ganesh Seva
      </Text>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        {pandals.length === 0
          ? "You are not a member of the Pandal yet. Request to join or create the Pandal. You will not see expenses, collections, or the Permanent Fund until an admin accepts you."
          : "Open a Pandal you already belong to, or join another with a code."}
      </Text>
      {pending.length > 0 ? (
        <View style={{ gap: 8 }}>
          {pending.map((request) => (
            <Text key={request.id} style={{ color: theme.colors.foreground, fontWeight: "700" }}>
              Request pending{request.pandalName ? ` for ${request.pandalName}` : ""}. An admin must accept you first.
            </Text>
          ))}
        </View>
      ) : null}
      {rejected.length > 0 && pandals.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          A previous join request was rejected. You can request again with the Pandal code.
        </Text>
      ) : null}

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
          <Button onPress={() => setMode("join")}>Request to Join</Button>
          <Button variant="outline" onPress={() => setMode("create")}>
            Create Pandal
          </Button>
        </View>
      ) : null}

      {mode === "create" ? (
        <View style={{ gap: 12 }}>
          <Input label="Pandal name" value={pandalName} onChangeText={setPandalName} placeholder="Sri Ganesh Youth Committee" />
          <Input label="Area (optional)" value={area} onChangeText={setArea} />
          <Input label="Festival" value={festivalName} onChangeText={setFestivalName} />
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Do you already have money belonging to the Pandal?
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button variant={hasExistingFund ? "outline" : "primary"} onPress={() => setHasExistingFund(false)}>
              No
            </Button>
            <Button variant={hasExistingFund ? "primary" : "outline"} onPress={() => setHasExistingFund(true)}>
              Yes
            </Button>
          </View>
          {hasExistingFund ? (
            <View style={{ gap: 12 }}>
              <Input
                label="Existing Permanent Fund"
                value={initialAmount}
                onChangeText={setInitialAmount}
                keyboardType="numeric"
              />
              <Text style={{ color: theme.colors.mutedForeground, fontWeight: "700" }}>
                Money location
              </Text>
              <FundLocationChips value={fundLocation} onChange={setFundLocation} />
              <Input
                label="Source / description"
                value={fundDescription}
                onChangeText={setFundDescription}
                placeholder="Existing Pandal Fund"
              />
              <Input
                label="Use for this first festival (0 keeps it in the Permanent Fund)"
                value={allocateAmount}
                onChangeText={setAllocateAmount}
                keyboardType="numeric"
              />
              <Text style={{ color: theme.colors.mutedForeground }}>
                This amount is not a {festivalName} donation. Remaining Permanent Fund{" "}
                {formatInr(Math.max(0, Number(initialAmount || 0) - Number(allocateAmount || 0)))}.
              </Text>
            </View>
          ) : null}
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
            placeholder="GNSH-XXXX"
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
      <Text style={{ color: theme.colors.mutedForeground }}>Code {formatPandalCode(code)}</Text>
      {openFestival ? (
        <Text style={{ color: theme.colors.mutedForeground }}>{openFestival.name}</Text>
      ) : null}
    </Pressable>
  );
}
