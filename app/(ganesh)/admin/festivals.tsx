import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminFestivalsScreen() {
  const { theme } = useTheme();
  const { push } = useRouter();
  const { pandalId, festivalId, setSession } = useGaneshSession();
  const { festivals, loading, error, retry } = useFestivals(pandalId);
  const writes = useGaneshWrites();
  const current = festivals.find((item) => item.id === festivalId);
  const [_name, setName] = useState<string | undefined>(undefined);
  const [_year, setYear] = useState<string | undefined>(undefined);
  const name = _name ?? current?.name ?? "";
  const year = _year ?? (current ? String(current.year) : "");

  return (
    <GaneshScreen>
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Opening money comes from the Permanent Fund or Opening Fund screens. This list is only
        the festival name, year, and which one is current.
      </Text>
      <AdminQueryState
        loading={loading && festivals.length === 0}
        error={error}
        onRetry={retry}
        empty={
          festivals.length === 0
            ? { title: "No previous festivals", description: "Create your first Ganesh festival." }
            : null
        }
      >
        {festivals.map((festival) => (
          <AdminLinkRow
            key={festival.id}
            title={festival.name}
            subtitle={`${festival.year} · ${festival.status === "open" ? "Active" : "Closed"}`}
            badge={festival.id === festivalId ? "Current" : festival.status === "open" ? "Switch" : "Closed"}
            tone={
              festival.id === festivalId
                ? "attention"
                : festival.status === "open"
                  ? "normal"
                  : "normal"
            }
            onPress={() => {
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
            }}
          />
        ))}
      </AdminQueryState>
      {current ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Edit current festival
          </Text>
          <Input label="Festival name" value={name} onChangeText={setName} />
          <Input label="Year" value={year} onChangeText={setYear} keyboardType="numeric" />
          <Button
            onPress={() => {
              writes
                .updateFestivalDetails(current.id, {
                  name,
                  year: Number(year),
                })
                .catch((caught) => {
                  logError("ganesh.admin.festival", caught);
                  toast.error(friendlyErrorMessage(caught, "Could not save the festival."));
                });
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
                    { text: "Continue", onPress: () => push("/(ganesh)/close-festival" as never) },
                  ]
                );
              }}
            >
              Close festival
            </Button>
          ) : null}
        </View>
      ) : null}
      <Button onPress={() => push("/(ganesh)/create-festival" as never)}>Create festival</Button>
    </GaneshScreen>
  );
}
