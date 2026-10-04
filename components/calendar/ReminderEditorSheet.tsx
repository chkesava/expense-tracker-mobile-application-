import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { Modal } from "@/components/common/Modal";
import { ChipRow } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  REMINDER_CATEGORIES,
  REMINDER_RECURRENCES,
  type CalendarReminder,
  type ReminderCategory,
  type ReminderLeadDays,
  type ReminderRecurrence,
} from "@/shared/types/calendarReminder";
import { REMINDER_CATEGORY_LABELS, REMINDER_RECURRENCE_LABELS, validateReminderDraft, type ReminderDraft } from "@/shared/utils/calendarReminders";
import { shiftDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

const LEAD_LABELS: Record<ReminderLeadDays, string> = { 0: "On the day", 1: "1 day before", 3: "3 days before", 7: "1 week before" };

/**
 * Create or edit a financial reminder (SPENDLY-183). A reminder is a note on
 * the calendar — saving it never records an expense, income or bill.
 */
export function ReminderEditorSheet({
  isOpen,
  existing,
  defaultDate,
  today,
  saving,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  existing: CalendarReminder | null;
  defaultDate: string;
  today: string;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: ReminderDraft) => void;
}) {
  const { theme } = useTheme();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("bill");
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>("none");
  const [interval, setInterval] = useState("30");
  const [untilDate, setUntilDate] = useState("");
  const [note, setNote] = useState("");
  const [lead, setLead] = useState<ReminderLeadDays>(1);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(existing?.title ?? "");
    setStartDate(existing?.startDate ?? defaultDate);
    setTime(existing?.time ?? "");
    setAmount(existing?.estimatedAmount !== undefined ? String(existing.estimatedAmount) : "");
    setCategory(existing?.category ?? "bill");
    setRecurrence(existing?.recurrence ?? "none");
    setInterval(String(existing?.intervalDays ?? 30));
    setUntilDate(existing?.untilDate ?? "");
    setNote(existing?.note ?? "");
    setLead(existing?.remindDaysBefore ?? 1);
    setShowErrors(false);
  }, [isOpen, existing, defaultDate]);

  const draft: ReminderDraft = {
    title,
    startDate: startDate.trim(),
    time: time.trim() || undefined,
    estimatedAmount: amount.trim() ? Number(amount.replace(/,/g, "")) : undefined,
    category,
    recurrence,
    intervalDays: recurrence === "every_n_days" ? Number(interval) : undefined,
    untilDate: recurrence !== "none" && untilDate.trim() ? untilDate.trim() : undefined,
    note: note.trim() || undefined,
    remindDaysBefore: lead,
  };
  const issues = validateReminderDraft(draft);
  const label = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm };
  const hint = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? "Edit reminder" : "New reminder"} density="compact" maxHeight="92%">
      <View style={{ gap: theme.space.md }}>
        <Text style={hint}>A reminder is a note on your calendar. It never records an expense or income.</Text>
        <Input label="What to remember" value={title} onChangeText={setTitle} placeholder="e.g. Renew car insurance" maxLength={120} />
        <Input label="Date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
        <ChipRow<string>
          options={[
            { value: today, label: "Today" },
            { value: shiftDateKey(today, 1), label: "Tomorrow" },
            { value: shiftDateKey(today, 7), label: "In a week" },
          ]}
          selected={startDate}
          onSelect={setStartDate}
        />
        <Input label="Time (optional, HH:mm)" value={time} onChangeText={setTime} placeholder="09:30" autoCapitalize="none" />
        <Input label="Amount (optional)" value={amount} onChangeText={setAmount} keyboardType="numeric" helperText="Shown on the calendar only — not counted as money." />

        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Category</Text>
          <ChipRow<ReminderCategory> options={REMINDER_CATEGORIES.map((c) => ({ value: c, label: REMINDER_CATEGORY_LABELS[c] }))} selected={category} onSelect={setCategory} />
        </View>

        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Repeat</Text>
          <ChipRow<ReminderRecurrence> options={REMINDER_RECURRENCES.map((r) => ({ value: r, label: REMINDER_RECURRENCE_LABELS[r] }))} selected={recurrence} onSelect={setRecurrence} />
          {recurrence === "every_n_days" ? <Input label="Every how many days" value={interval} onChangeText={setInterval} keyboardType="numeric" /> : null}
          {recurrence !== "none" ? <Input label="Until (optional, YYYY-MM-DD)" value={untilDate} onChangeText={setUntilDate} autoCapitalize="none" /> : null}
        </View>

        <View style={{ gap: theme.space.xs }}>
          <Text style={label}>Remind me</Text>
          <ChipRow<string>
            options={(Object.keys(LEAD_LABELS) as unknown as ReminderLeadDays[]).map((d) => ({ value: String(d), label: LEAD_LABELS[Number(d) as ReminderLeadDays] }))}
            selected={String(lead)}
            onSelect={(v) => setLead(Number(v) as ReminderLeadDays)}
          />
        </View>

        <Input label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={500} />

        {showErrors && issues.length ? (
          <View accessibilityLiveRegion="polite">
            {issues.map((i) => (
              <Text key={i} style={[hint, { color: theme.colors.destructive }]}>
                {i}
              </Text>
            ))}
          </View>
        ) : null}
        <Button
          loading={saving}
          onPress={() => {
            if (issues.length) {
              setShowErrors(true);
              return;
            }
            onSave(draft);
          }}
        >
          {existing ? "Save reminder" : "Add reminder"}
        </Button>
      </View>
    </Modal>
  );
}
