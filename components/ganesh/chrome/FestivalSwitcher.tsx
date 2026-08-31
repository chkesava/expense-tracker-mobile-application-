import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { DataRow } from "@/components/ganesh/ui";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { useFestivals } from "@/hooks/useFestivals";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import {
  FESTIVAL_DISPLAY_LABEL,
  festivalDisplayLabel,
  festivalDisplayStatus,
} from "@/shared/utils/ganeshFestivalStatus";
import { useTheme } from "@/theme/ThemeProvider";

export function FestivalSwitcher({
  variant,
  fallbackName,
}: {
  variant: "pill" | "subtitle";
  fallbackName?: string;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const { pandalId, festivalId, setSession } = useGaneshSession();
  const { festivals } = useFestivals(pandalId);
  const [open, setOpen] = useState(false);
  const current = festivals.find((item) => item.id === festivalId);
  const name = current?.name || fallbackName;
  if (!name) return null;

  const statusLabel = current
    ? festivalDisplayLabel(current)
    : FESTIVAL_DISPLAY_LABEL.active;
  const ink = variant === "pill" ? "#FFF8F1" : "#E8C36A";
  const label = `${name} · ${statusLabel}`;

  return (
    <>
      <Pressable
        onPress={() => {
          void haptic.selection();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Switch festival.`}
        style={({ pressed }) => [
          variant === "pill" ? styles.pill : styles.subtitleBtn,
          variant === "pill" ? { backgroundColor: "#C2410C" } : null,
          pressed ? { opacity: 0.8 } : null,
        ]}
      >
        <Text
          style={[
            variant === "pill" ? styles.pillText : styles.subtitleText,
            {
              color: ink,
              fontFamily:
                variant === "pill" ? theme.fontFamily.semibold : theme.fontFamily.medium,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <ChevronDown size={variant === "pill" ? 12 : 14} color={ink} strokeWidth={2.4} />
      </Pressable>

      <Modal
        transparent
        animationType="fade"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={() => undefined}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.card,
                borderColor: g.divider,
              },
            ]}
          >
            <Text
              style={[
                styles.sheetTitle,
                { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
              ]}
            >
              Festivals
            </Text>
            <ScrollView style={styles.list} bounces={false}>
              {festivals.map((festival, index) => {
                const status = festivalDisplayStatus(festival);
                const selected = festival.id === festivalId;
                return (
                  <DataRow
                    key={festival.id}
                    divider={index < festivals.length - 1}
                    title={festival.name}
                    meta={`${festival.year} · ${FESTIVAL_DISPLAY_LABEL[status]}`}
                    value={
                      selected ? (
                        <Text
                          style={{
                            color: g.saffron,
                            fontFamily: theme.fontFamily.semibold,
                            fontSize: 12,
                          }}
                        >
                          Current
                        </Text>
                      ) : null
                    }
                    onPress={() => {
                      setOpen(false);
                      if (!pandalId || festival.id === festivalId) return;
                      void setSession({ pandalId, festivalId: festival.id }).then(() => {
                        toast.success(`Viewing ${festival.name}`);
                      });
                    }}
                  />
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  pillText: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  subtitleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingVertical: 2,
  },
  subtitleText: {
    fontSize: 13,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    maxHeight: "70%",
  },
  sheetTitle: {
    fontSize: 18,
    marginBottom: 8,
  },
  list: {
    maxHeight: 360,
  },
});
