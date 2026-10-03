import { collection, doc } from "firebase/firestore";

import { commitMutations } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { WriteOutcome } from "@/lib/firestoreWrite";
import type { CalendarReminder } from "@/shared/types/calendarReminder";
import { reminderDoc, toggleReminderCompletion, validateReminderDraft, type ReminderDraft } from "@/shared/utils/calendarReminders";

/**
 * Persisting calendar reminders (SPENDLY-183) at users/{uid}/calendarReminders.
 * Writes go through the offline outbox. A reminder write never touches an
 * expense, income, bill or any other record.
 */
export const CALENDAR_REMINDERS_COLLECTION = "calendarReminders";

function remindersCollection(uid: string) {
  const db = getFirestoreDb();
  return db ? collection(db, "users", uid, CALENDAR_REMINDERS_COLLECTION) : null;
}

/** Create (no `existing`) or replace (with `existing`). Throws on an invalid draft. */
export async function saveReminder(uid: string, draft: ReminderDraft, existing?: CalendarReminder): Promise<WriteOutcome | null> {
  const col = remindersCollection(uid);
  if (!col) return null;
  const issues = validateReminderDraft(draft);
  if (issues.length) throw new Error(issues[0]);
  const now = Date.now();
  const ref = existing ? doc(col, existing.id) : doc(col);
  const data = reminderDoc(draft, { completedDates: existing?.completedDates ?? [], createdAtMs: existing?.createdAtMs ?? now }, now);
  return commitMutations(uid, [{ op: "set", ref, data }], { label: "reminder" });
}

export async function setReminderOccurrenceDone(uid: string, reminder: CalendarReminder, date: string, done: boolean): Promise<WriteOutcome | null> {
  const col = remindersCollection(uid);
  if (!col) return null;
  return commitMutations(
    uid,
    [{ op: "update", ref: doc(col, reminder.id), data: { completedDates: toggleReminderCompletion(reminder.completedDates, date, done), updatedAtMs: Date.now() } }],
    { label: "reminder" }
  );
}

export async function deleteReminder(uid: string, reminderId: string): Promise<WriteOutcome | null> {
  const col = remindersCollection(uid);
  if (!col) return null;
  return commitMutations(uid, [{ op: "delete", ref: doc(col, reminderId) }], { label: "reminder" });
}
