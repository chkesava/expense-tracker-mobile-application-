import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";

import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import {
  GaneshHeader,
  NavRow,
  Section,
  StatusStrip,
  useGaneshTokens,
} from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";

export default function AdminFestivalsScreen() {
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { pandalId, festivalId, setSession } = useGaneshSession();
  const { festivals, loading, error, retry } = useFestivals(pandalId);
  const writes = useGaneshWrites();

  const current = festivals.find((item) => item.id === festivalId);
  const [_name, setName] = useState<string | undefined>(undefined);
  const [_year, setYear] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const name = _name ?? current?.name ?? "";
  const year = _year ?? (current ? String(current.year) : "");

  const switchTo = (festival: (typeof festivals)[number]) => {
    if (!pandalId || festival.id === festivalId) return;
    Alert.alert(
      "Switch festival?",
      `Open ${festival.name} as the current festival on this phone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: () => {
            void setSession({ pandalId, festivalId: festival.id }).then(() => {
              toast.success(`Opened ${festival.name}`);
            });
          },
        },
      ]
    );
  };

  return (
    <GaneshScreen safeTop>
      <GaneshHeader
        title="Festivals"
        subtitle={`${festivals.length} recorded`}
        icon={<CalendarDays size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />

      <StatusStrip
        tone="info"
        message="This list is only the festival name, year, and which one is current. Opening money comes from the Permanent Fund or Opening Fund screens."
      />

      <AdminQueryState
        loading={loading && festivals.length === 0}
        error={error}
        onRetry={retry}
        empty={
          festivals.length === 0
            ? {
                title: "No festivals yet",
                description: "Create your first Ganesh festival to start a ledger.",
              }
            : null
        }
      >
        <Section title="All festivals">
          {festivals.map((festival, index) => {
            const isCurrent = festival.id === festivalId;
            return (
              <NavRow
                key={festival.id}
                title={festival.name}
                meta={`${festival.year} · ${festival.status === "open" ? "Open" : "Closed"}`}
                divider={index < festivals.length - 1}
                badge={
                  isCurrent
                    ? { kind: "received", label: "Current" }
                    : festival.status === "open"
                      ? { kind: "promised", label: "Switch" }
                      : undefined
                }
                onPress={() => switchTo(festival)}
              />
            );
          })}
        </Section>
      </AdminQueryState>

      {current ? (
        <Section title="Edit current festival" subtitle={current.name}>
          <View style={styles.form}>
            <Input label="Festival name" value={name} onChangeText={setName} />
            <Input label="Year" value={year} onChangeText={setYear} keyboardType="numeric" />
            <Button
              loading={busy}
              disabled={!name.trim()}
              onPress={() => {
                setBusy(true);
                writes
                  .updateFestivalDetails(current.id, { name, year: Number(year) })
                  .catch((caught) => {
                    logError("ganesh.admin.festival", caught);
                    toast.error(friendlyErrorMessage(caught, "Could not save the festival."));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Save festival
            </Button>

            {current.status === "open" ? (
              <Button
                variant="outline"
                onPress={() => {
                  Alert.alert(
                    "Close festival?",
                    "You can transfer unused cash to the Permanent Fund first. This cannot be undone from here.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Continue",
                        onPress: () => push("/(ganesh)/close-festival" as never),
                      },
                    ]
                  );
                }}
              >
                Close festival
              </Button>
            ) : null}
          </View>
        </Section>
      ) : null}

      <Button onPress={() => push("/(ganesh)/create-festival" as never)}>
        Create festival
      </Button>
    </GaneshScreen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
});
