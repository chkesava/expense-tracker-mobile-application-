import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Flame } from "lucide-react-native";

import { FormDetails } from "@/components/ganesh/FormDetails";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshWriteLock } from "@/components/ganesh/GaneshWriteLock";
import {
  FilterChips,
  GaneshHeader,
  MetaLabel,
  Section,
  SEVA_KINDS,
  sevaKindLabel,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGaneshPermissions } from "@/hooks/useGaneshPermissions";
import { useFestivalWriteLock } from "@/hooks/useFestivalWriteLock";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { SevaKind } from "@/shared/types/ganesh";
import { todayDateInput } from "@/shared/utils/ganeshIdentity";
import { CLOSED_FESTIVAL_WRITE_MESSAGE } from "@/shared/utils/ganeshFestivalStatus";
import { validateSeva } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Plan a seva.
 *
 * Progressive disclosure: name, kind, day and time are all a committee needs to
 * put something on the schedule. Location and notes sit behind "Add details",
 * because asking for six fields to record a 6am aarti is why the old forms went
 * unused.
 */
export default function AddSevaScreen() {
  const { theme } = useTheme();
  const { back } = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const writes = useGaneshWrites();
  const { can } = useGaneshPermissions();
  const { closed } = useFestivalWriteLock();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<SevaKind>("aarti");
  const [date, setDate] = useState(params.date || todayDateInput());
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const g = useGaneshTokens();

  const kindOptions = useMemo(
    () => SEVA_KINDS.map((item) => ({ id: item, label: sevaKindLabel(item) })),
    []
  );

  const draft = { name, kind, date, startTime, endTime };
  const valid = validateSeva(draft);

  if (!can("seva.write")) {
    return <GaneshWriteLock message="Your role cannot plan seva. Ask a Pandal Admin or the treasurer." />;
  }
  if (closed) {
    return <GaneshWriteLock message={CLOSED_FESTIVAL_WRITE_MESSAGE} />;
  }

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Plan a seva"
        icon={<Flame size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 21 }}>
        A seva is something the Pandal does — an aarti, annadanam, a programme. Money spent on it
        is recorded separately as an expense.
      </Text>

      <Input
        label="What is happening?"
        value={name}
        onChangeText={setName}
        placeholder="Morning Aarti"
      />

      <Section title="Kind of seva" plain rule={false}>
        <FilterChips
          layout="wrap"
          value={kind}
          options={kindOptions}
          onChange={(next) => {
            setKind(next);
            // Offer the kind's name once, as a starting point the person can
            // overwrite — most seva are called what they are.
            if (!name.trim()) setName(sevaKindLabel(next));
          }}
        />
      </Section>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Input label="Date" value={date} onChangeText={setDate} placeholder="2026-08-28" />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Start time"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="06:00"
          />
        </View>
      </View>
      <MetaLabel>Date as YYYY-MM-DD, time on a 24-hour clock.</MetaLabel>

      <FormDetails>
        <Input
          label="End time (optional)"
          value={endTime}
          onChangeText={setEndTime}
          placeholder="07:00"
        />
        <Input
          label="Where (optional)"
          value={location}
          onChangeText={setLocation}
          placeholder="Main pandal"
        />
        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything the volunteers should know"
        />
      </FormDetails>

      {!valid.ok && (name.trim() || date !== todayDateInput()) ? (
        <Text style={{ color: theme.colors.destructive, fontSize: 13 }}>{valid.error}</Text>
      ) : null}

      <Button
        loading={busy}
        disabled={!valid.ok}
        onPress={() => {
          setBusy(true);
          writes
            .createSeva({
              name,
              kind,
              date,
              startTime,
              endTime: endTime || undefined,
              location: location || undefined,
              notes: notes || undefined,
            })
            .then(() => back())
            .catch((error) => {
              logError("ganesh.createSeva", error);
              toast.error(friendlyErrorMessage(error, "Could not save this seva."));
            })
            .finally(() => setBusy(false));
        }}
      >
        Add to schedule
      </Button>
    </GaneshScreen>
  );
}
