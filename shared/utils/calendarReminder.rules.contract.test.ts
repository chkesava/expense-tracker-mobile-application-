import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { REMINDER_CATEGORIES, REMINDER_LEAD_DAYS, REMINDER_LIMITS, REMINDER_RECURRENCES } from "../types/calendarReminder";
import { reminderDoc } from "./calendarReminders";

/** SPENDLY-183 — the reminder document and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const body = rules.slice(rules.indexOf("function calendarReminderWellFormed("), rules.indexOf("match /calendarReminders/"));
const list = (re: RegExp) => [...(body.match(re)?.[1] ?? "").matchAll(/'([^']+)'|(\d+)/g)].map((m) => m[1] ?? Number(m[2]));

describe("calendar reminder rules contract", () => {
  it("allows every field the app can write", () => {
    const full = reminderDoc(
      { title: "t", startDate: "2026-10-20", time: "09:00", estimatedAmount: 1, category: "bill", recurrence: "every_n_days", intervalDays: 2, untilDate: "2026-12-01", note: "n", remindDaysBefore: 0 },
      { completedDates: [], createdAtMs: 1 },
      2
    );
    expect((list(/hasOnly\(\[([^\]]*)\]\)/) as string[]).sort()).toEqual(Object.keys(full).sort());
  });

  it("matches enums and limits", () => {
    expect(list(/d\.category in \[([^\]]*)\]/)).toEqual([...REMINDER_CATEGORIES]);
    expect(list(/d\.recurrence in \[([^\]]*)\]/)).toEqual([...REMINDER_RECURRENCES]);
    expect(list(/d\.remindDaysBefore in \[([^\]]*)\]/)).toEqual([...REMINDER_LEAD_DAYS]);
    expect(body).toContain(`d.title.size() <= ${REMINDER_LIMITS.title}`);
    expect(body).toContain(`d.note.size() <= ${REMINDER_LIMITS.note}`);
    expect(body).toContain(`d.intervalDays <= ${REMINDER_LIMITS.maxIntervalDays}`);
    expect(body).toContain(`d.completedDates.size() <= ${REMINDER_LIMITS.maxCompleted}`);
  });

  it("never allows ledger-shaped money fields", () => {
    const allowed = list(/hasOnly\(\[([^\]]*)\]\)/);
    for (const f of ["amount", "date", "accountId", "month"]) expect(allowed).not.toContain(f);
  });
});
