import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";

import { AdminLinkRow } from "@/components/ganesh/AdminLinkRow";
import { AdminQueryState } from "@/components/ganesh/AdminQueryState";
import { FestivalWindowFields } from "@/components/ganesh/FestivalWindowFields";
import { GaneshScreen } from "@/components/ganesh/GaneshScreen";
import { GaneshHeader, Section, useGaneshTokens } from "@/components/ganesh/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFestivals } from "@/hooks/useFestivals";
import { useGaneshWrites } from "@/hooks/useGaneshWrites";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { formatFestivalWindow, validateFestivalWindow } from "@/shared/utils/ganeshSeva";
import { useTheme } from "@/theme/ThemeProvider";

export default function AdminFestivalsScreen() {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { push, back } = useRouter();
  const { pandalId, festivalId, setSession } = useGaneshSession();
  const { festivals, loading, error, retry } = useFestivals(pandalId);
  const writes = useGaneshWrites();
  const current = festivals.find((item) => item.id === festivalId);
  const [_name, setName] = useState<string | undefined>(undefined);
  const [_year, setYear] = useState<string | undefined>(undefined);
  const [_startDate, setStartDate] = useState<string | undefined>(undefined);
  const [_endDate, setEndDate] = useState<string | undefined>(undefined);
  const name = _name ?? current?.name ?? "";
  const year = _year ?? (current ? String(current.year) : "");
  const startDate = _startDate ?? current?.startDate ?? "";
  const endDate = _endDate ?? current?.endDate ?? "";

  return (
    <GaneshScreen>
      <GaneshHeader
        title="Festivals"
        icon={<CalendarDays size={22} color={g.saffron} strokeWidth={2.2} />}
        onBack={back}
      />
      <Text style={{ color: theme.colors.mutedForeground, lineHeight: 22 }}>
        Opening money comes from the Permanent Fund or Opening Fund screens. Set the first and
        last day so Home can show “Day 4 of 10” and Seva can draw the full day strip.
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
        <Section title="Festivals">
        {festivals.map((festival, index) => (
          <AdminLinkRow
            key={festival.id}
            divider={index < festivals.length - 1}
            title={festival.name}
            subtitle={`${festival.year} · ${festival.status === "open" ? "Active" : "Closed"}${
              formatFestivalWindow(festival) ? ` · ${formatFestivalWindow(festival)}` : ""
            }`}
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
        </Section>
      </AdminQueryState>
      {current ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "700" }}>
            Edit current festival
          </Text>
          <Input label="Festival name" value={name} onChangeText={setName} />
          <Input label="Year" value={year} onChangeText={setYear} keyboardType="numeric" />
          <FestivalWindowFields
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <Button
            onPress={() => {
              const window = validateFestivalWindow(startDate, endDate);
              if (!window.ok) {
                toast.error(window.error);
                return;
              }
              writes
                .updateFestivalDetails(current.id, {
                  name,
                  year: Number(year),
                  startDate,
                  endDate,
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
