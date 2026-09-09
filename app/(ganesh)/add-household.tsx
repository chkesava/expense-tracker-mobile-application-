import { useMemo, useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Home } from "lucide-react-native";

import { DuplicateHouseholdDialog } from "@/components/ganesh/DuplicateHouseholdDialog";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import { GaneshHeader, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { useHouseholds } from "@/hooks/useHouseholds";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { possibleHouseholdDuplicates } from "@/shared/utils/ganeshMath";
import { useTheme } from "@/theme/ThemeProvider";

export default function AddHouseholdScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { back, replace } = useRouter();
  const { pandalId, festivalId } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const festival = festivals.find((item) => item.id === festivalId);
  const { households } = useHouseholds(pandalId, festivalId);
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { closed, lockMessage } = useFestivalWriteLock();
  const [name, setName] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<typeof households>([]);

  const payload = useMemo(
    () => ({
      name,
      houseNumber,
      mobile,
      area,
      notes,
      expectedAmount: festival?.householdTargetAmount ?? 0,
    }),
    [area, festival?.householdTargetAmount, houseNumber, mobile, name, notes]
  );

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await writes.createHousehold(payload);
      setMatches([]);
      replace(`/(ganesh)/household/${id}`);
    } catch (error) {
      logError("ganesh.createHousehold", error);
      toast.error(friendlyErrorMessage(error, "Could not add the household."));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = () => {
    const foundIds = new Set(
      possibleHouseholdDuplicates(households, { name, houseNumber, mobile }).map(
        (household) => household.id
      )
    );
    const found = households.filter((household) => foundIds.has(household.id));
    if (found.length > 0) {
      setMatches(found);
      return;
    }
    void save();
  };

  if (!can("collections.update")) {
    return <GaneshWriteLock message="Your role cannot add households." />;
  }
  if (closed) {
    return <GaneshWriteLock message={lockMessage} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Add household"
        icon={<Home size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>
        Seed the house before anyone collects. Mobile is optional. A promise or payment later
        never counts twice as cash.
      </Text>
      <Input label="Name" value={name} onChangeText={setName} placeholder="Ramesh Kumar" />
      <Input
        label="House number (optional)"
        value={houseNumber}
        onChangeText={setHouseNumber}
        placeholder="12-A"
      />
      <Input
        label="Area / street (optional)"
        value={area}
        onChangeText={setArea}
        placeholder="Gandhi Street"
      />
      <Input
        label="Mobile (optional)"
        value={mobile}
        onChangeText={setMobile}
        keyboardType="phone-pad"
      />
      <Input
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Best time to visit, gate code"
      />
      {festival?.householdTargetAmount ? (
        <Text style={{ color: theme.colors.mutedForeground }}>
          Expected chanda defaults to the festival household target.
        </Text>
      ) : null}
      <Button loading={busy} onPress={onSubmit}>
        Add household
      </Button>
      {matches.length > 0 ? (
        <DuplicateHouseholdDialog
          matches={matches}
          busy={busy}
          onCancel={() => setMatches([])}
          onMerge={(id) => {
            setMatches([]);
            replace(`/(ganesh)/household/${id}`);
          }}
          onCreateNew={() => {
            void save();
          }}
        />
      ) : null}
    </GaneshScreen>
  );
}
