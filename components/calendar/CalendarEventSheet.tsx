import { Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import type { CalendarEvent } from "@/shared/types/calendar";
import { calendarEventActions, calendarStateExplanation, type CalendarEventAction } from "@/shared/utils/calendarActions";
import { CALENDAR_SOURCE_LABELS, CALENDAR_STATE_LABELS, longDateLabel } from "@/shared/utils/calendarMonth";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Event detail (SPENDLY-181): what the event is, where it comes from, what
 * its state means, and the action that takes the user to the source feature.
 * `event` is looked up from live calendar data, so a deleted source shows as
 * "no longer available" instead of a misleading action.
 */
export function CalendarEventSheet({
  isOpen,
  event,
  format,
  onClose,
  onAction,
}: {
  isOpen: boolean;
  event: CalendarEvent | null;
  format: (n: number) => string;
  onClose: () => void;
  onAction: (action: CalendarEventAction) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const actions = calendarEventActions(event);
  const label = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const value = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };

  const row = (k: string, v: string) => (
    <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.space.md }} accessible accessibilityLabel={`${k}: ${v}`}>
      <Text style={label}>{k}</Text>
      <Text style={[value, { flexShrink: 1, textAlign: "right" }]}>{v}</Text>
    </View>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={event?.title ?? "Event"} density="compact">
      {!event ? (
        <Text style={[value, { fontFamily: theme.fontFamily.regular }]}>This item is no longer available. It may have been deleted or changed.</Text>
      ) : (
        <View style={{ gap: theme.space.md }}>
          <View style={{ gap: theme.space.sm }}>
            {row("Date", `${longDateLabel(event.date)}${event.time ? ` at ${event.time}` : ""}`)}
            {event.amount !== null
              ? row(event.direction === "in" ? "Money in" : event.direction === "out" ? "Money out" : "Amount", format(event.amount))
              : row("Amount", "No amount")}
            {row("Status", CALENDAR_STATE_LABELS[event.state])}
            {row("From", CALENDAR_SOURCE_LABELS[event.source])}
            {event.subtitle ? row("Details", event.subtitle) : null}
          </View>
          <View style={{ backgroundColor: surfaces.tile, borderRadius: theme.radius.md, padding: theme.space.md }}>
            <Text style={label}>{calendarStateExplanation(event)}</Text>
          </View>
          {actions.map((a) => (
            <Button key={a.label} variant={a.primary ? "primary" : "outline"} onPress={() => onAction(a)}>
              {a.label}
            </Button>
          ))}
        </View>
      )}
    </Modal>
  );
}
