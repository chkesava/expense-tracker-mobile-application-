import { describe, expect, it } from "vitest";

import type { PrasadamEntry } from "@/shared/types/ganeshPrasadam";
import {
  assertCanCancelPrasadamEntry,
  assertCanEditPrasadamEntry,
  defaultPrasadamSession,
  entriesForSession,
  filterPrasadam,
  findDuplicateProvider,
  formatPrasadamQuantity,
  groupPrasadamByDay,
  isPrasadamSessionLate,
  normalizeQuantity,
  prasadamSessionState,
  sortWithinSession,
  summarizePrasadamDay,
  summarizePrasadamEntries,
  summarizePrasadamSession,
  validatePrasadamEntry,
} from "@/shared/utils/ganeshPrasadam";

let seq = 0;

function entry(over: Partial<PrasadamEntry> = {}): PrasadamEntry {
  seq += 1;
  return {
    id: over.id ?? `e${seq}`,
    date: "2026-09-16",
    session: "morning",
    providerName: "Provider",
    prasadamType: "sweet",
    quantity: 1,
    unit: "pieces",
    status: "recorded",
    createdBy: "u1",
    updatedBy: "u1",
    createdAt: { seconds: seq, nanoseconds: 0 },
    ...over,
  } as PrasadamEntry;
}

describe("multiple providers per session", () => {
  // The ticket's headline requirement: entries must never overwrite each other.
  it("keeps every provider in one morning", () => {
    const entries = [
      entry({ providerName: "A" }),
      entry({ providerName: "B" }),
      entry({ providerName: "C" }),
    ];
    const summary = summarizePrasadamSession(entries, "2026-09-16", "morning");
    expect(summary.entryCount).toBe(3);
    expect(summary.providerCount).toBe(3);
  });

  it("keeps morning and evening separate for the same person", () => {
    const entries = [
      entry({ providerName: "Ravi", session: "morning" }),
      entry({ providerName: "Ravi", session: "evening" }),
    ];
    expect(entriesForSession(entries, "2026-09-16", "morning")).toHaveLength(1);
    expect(entriesForSession(entries, "2026-09-16", "evening")).toHaveLength(1);

    // One person who fed the pandal twice is one household, not two.
    const day = summarizePrasadamDay(entries, "2026-09-16");
    expect(day.entryCount).toBe(2);
    expect(day.providerCount).toBe(1);
  });

  it("keeps the same person's entries separate across days", () => {
    const entries = [
      entry({ providerName: "Ravi", date: "2026-09-16" }),
      entry({ providerName: "Ravi", date: "2026-09-17" }),
    ];
    expect(summarizePrasadamDay(entries, "2026-09-16").entryCount).toBe(1);
    expect(summarizePrasadamDay(entries, "2026-09-17").entryCount).toBe(1);
  });

  it("keeps two items from one person in one session as two entries", () => {
    const entries = [
      entry({ providerName: "Ravi", prasadamLabel: "Laddu" }),
      entry({ providerName: "Ravi", prasadamLabel: "Vada" }),
    ];
    const summary = summarizePrasadamSession(entries, "2026-09-16", "morning");
    expect(summary.entryCount).toBe(2);
    expect(summary.providerCount).toBe(1);
  });

  it("counts a linked provider by link, not by spelling", () => {
    const entries = [
      entry({ providerId: "h1", providerName: "Ravi" }),
      entry({ providerId: "h1", providerName: "Ravi Kumar" }),
    ];
    expect(summarizePrasadamEntries(entries).providerCount).toBe(1);
  });

  it("treats loose spellings of an unlinked name as one provider", () => {
    const entries = [
      entry({ providerName: "Ravi", mobile: "98765 43210" }),
      entry({ providerName: " ravi ", mobile: "9876543210" }),
    ];
    expect(summarizePrasadamEntries(entries).providerCount).toBe(1);
  });
});

describe("incompatible units are never summed", () => {
  it("reports kg and pieces separately", () => {
    const summary = summarizePrasadamEntries([
      entry({ quantity: 5, unit: "kg" }),
      entry({ quantity: 30, unit: "pieces" }),
      entry({ quantity: 2.5, unit: "kg" }),
    ]);
    expect(summary.byUnit).toEqual([
      { unit: "kg", unitLabel: undefined, quantity: 7.5, entryCount: 2 },
      { unit: "pieces", unitLabel: undefined, quantity: 30, entryCount: 1 },
    ]);
    // The shape offers no way to ask for a single grand total.
    expect(summary).not.toHaveProperty("totalQuantity");
  });

  it("groups 'other' by the pandal's own word, case-insensitively", () => {
    const summary = summarizePrasadamEntries([
      entry({ quantity: 2, unit: "other", unitLabel: "dabba" }),
      entry({ quantity: 3, unit: "other", unitLabel: "Dabba" }),
      entry({ quantity: 1, unit: "other", unitLabel: "bucket" }),
    ]);
    expect(summary.byUnit).toHaveLength(2);
    expect(summary.byUnit[0]).toMatchObject({ unitLabel: "bucket", quantity: 1 });
    expect(summary.byUnit[1]).toMatchObject({ unitLabel: "dabba", quantity: 5 });
  });

  it("does not print floating point noise", () => {
    const summary = summarizePrasadamEntries([
      entry({ quantity: 0.1, unit: "kg" }),
      entry({ quantity: 0.2, unit: "kg" }),
    ]);
    expect(summary.byUnit[0].quantity).toBe(0.3);
  });

  it("formats a quantity with its unit", () => {
    expect(formatPrasadamQuantity(500, "pieces")).toBe("500 pieces");
    expect(formatPrasadamQuantity(5.5, "kg")).toBe("5.5 kg");
    expect(formatPrasadamQuantity(2, "other", "dabba")).toBe("2 dabba");
    expect(formatPrasadamQuantity(2, "other")).toBe("2 units");
  });
});

describe("cancellation", () => {
  it("drops cancelled entries from totals but keeps them countable", () => {
    const summary = summarizePrasadamEntries([
      entry({ quantity: 5, unit: "kg" }),
      entry({ quantity: 3, unit: "kg", status: "cancelled" }),
    ]);
    expect(summary.entryCount).toBe(1);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.byUnit[0].quantity).toBe(5);
  });

  it("treats a voided entry as inactive even when status says recorded", () => {
    const summary = summarizePrasadamEntries([entry({ voided: true })]);
    expect(summary.entryCount).toBe(0);
    expect(summary.cancelledCount).toBe(1);
  });

  it("refuses to edit or re-cancel a cancelled entry", () => {
    const cancelled = entry({ status: "cancelled" });
    expect(() => assertCanEditPrasadamEntry(cancelled)).toThrow(/cancelled/i);
    expect(() => assertCanCancelPrasadamEntry(cancelled)).toThrow(/already/i);
    expect(() => assertCanEditPrasadamEntry(null)).toThrow(/no longer/i);
  });

  it("allows editing and cancelling a recorded entry", () => {
    expect(() => assertCanEditPrasadamEntry(entry())).not.toThrow();
    expect(() => assertCanCancelPrasadamEntry(entry())).not.toThrow();
  });
});

describe("session state", () => {
  const today = "2026-09-16";

  it("is in-progress once today has an entry", () => {
    const entries = [entry({ date: today })];
    expect(prasadamSessionState(entries, today, "morning", today, "09:00")).toBe(
      "in-progress"
    );
  });

  it("is recorded for a past day with entries", () => {
    const entries = [entry({ date: "2026-09-15" })];
    expect(
      prasadamSessionState(entries, "2026-09-15", "morning", today, "09:00")
    ).toBe("recorded");
  });

  it("is missed for a past day with nothing", () => {
    expect(prasadamSessionState([], "2026-09-15", "evening", today, "09:00")).toBe(
      "missed"
    );
  });

  it("is not-started for a future day", () => {
    expect(prasadamSessionState([], "2026-09-18", "morning", today, "09:00")).toBe(
      "not-started"
    );
  });

  it("is cancelled when every entry in the session was cancelled", () => {
    const entries = [entry({ date: today, status: "cancelled" })];
    expect(prasadamSessionState(entries, today, "morning", today, "09:00")).toBe(
      "cancelled"
    );
  });

  it("flags a late session only on today, and only when empty", () => {
    expect(isPrasadamSessionLate([], today, "morning", today, "14:00")).toBe(true);
    expect(isPrasadamSessionLate([], today, "morning", today, "09:00")).toBe(false);
    expect(isPrasadamSessionLate([], "2026-09-15", "morning", today, "14:00")).toBe(
      false
    );
    const recorded = [entry({ date: today })];
    expect(isPrasadamSessionLate(recorded, today, "morning", today, "14:00")).toBe(
      false
    );
  });

  it("defaults the form to the session matching the clock", () => {
    expect(defaultPrasadamSession("08:30")).toBe("morning");
    expect(defaultPrasadamSession("12:00")).toBe("evening");
    expect(defaultPrasadamSession("19:45")).toBe("evening");
  });
});

describe("history grouping and order", () => {
  it("groups newest day first, morning before evening, oldest entry first", () => {
    const entries = [
      entry({ id: "b", date: "2026-09-16", session: "evening", createdAt: { seconds: 20, nanoseconds: 0 } }),
      entry({ id: "a", date: "2026-09-16", session: "morning", createdAt: { seconds: 10, nanoseconds: 0 } }),
      entry({ id: "c", date: "2026-09-17", session: "morning", createdAt: { seconds: 30, nanoseconds: 0 } }),
    ];
    const days = groupPrasadamByDay(entries);
    expect(days.map((d) => d.date)).toEqual(["2026-09-17", "2026-09-16"]);
    expect(days[1].morning.map((e) => e.id)).toEqual(["a"]);
    expect(days[1].evening.map((e) => e.id)).toEqual(["b"]);
  });

  it("orders stably when two entries share a timestamp", () => {
    const a = entry({ id: "a2", createdAt: { seconds: 5, nanoseconds: 0 } });
    const b = entry({ id: "a1", createdAt: { seconds: 5, nanoseconds: 0 } });
    expect(sortWithinSession([a, b]).map((e) => e.id)).toEqual(["a1", "a2"]);
  });

  it("puts an unsynced offline entry first rather than crashing", () => {
    const pending = entry({ id: "p", createdAt: undefined });
    const synced = entry({ id: "s", createdAt: { seconds: 9, nanoseconds: 0 } });
    expect(sortWithinSession([synced, pending]).map((e) => e.id)).toEqual(["p", "s"]);
  });
});

describe("filtering", () => {
  const entries = [
    entry({ id: "f1", providerName: "Ravi", prasadamLabel: "Laddu", session: "morning", mobile: "9876543210" }),
    entry({ id: "f2", providerName: "Lakshmi", prasadamLabel: "Kesari", session: "evening" }),
    entry({ id: "f3", providerName: "Suresh", prasadamLabel: "Pulihora", session: "morning", status: "cancelled" }),
  ];

  it("returns everything by default", () => {
    expect(filterPrasadam(entries)).toHaveLength(3);
  });

  it("filters by session", () => {
    expect(filterPrasadam(entries, { session: "evening" }).map((e) => e.id)).toEqual(["f2"]);
  });

  it("filters by status", () => {
    expect(filterPrasadam(entries, { status: "cancelled" }).map((e) => e.id)).toEqual(["f3"]);
  });

  it("searches name, item and mobile", () => {
    expect(filterPrasadam(entries, { search: "ravi" }).map((e) => e.id)).toEqual(["f1"]);
    expect(filterPrasadam(entries, { search: "kesari" }).map((e) => e.id)).toEqual(["f2"]);
    expect(filterPrasadam(entries, { search: "98765 43210" }).map((e) => e.id)).toEqual(["f1"]);
  });

  // The predicates must stay independent: coupling them shipped two bugs before.
  it("applies search and status together without either swallowing the other", () => {
    expect(filterPrasadam(entries, { search: "suresh", status: "recorded" })).toHaveLength(0);
    expect(filterPrasadam(entries, { search: "suresh", status: "cancelled" }).map((e) => e.id)).toEqual(["f3"]);
  });

  it("filters by date independently of everything else", () => {
    const mixed = [...entries, entry({ id: "f4", date: "2026-09-17", providerName: "Ravi" })];
    expect(filterPrasadam(mixed, { date: "2026-09-17" }).map((e) => e.id)).toEqual(["f4"]);
  });
});

describe("validation", () => {
  const valid = {
    date: "2026-09-16",
    session: "morning" as const,
    providerName: "Ravi",
    prasadamType: "sweet" as const,
    quantity: 5,
    unit: "kg" as const,
  };

  it("accepts a well-formed draft", () => {
    expect(validatePrasadamEntry(valid)).toEqual({ ok: true });
  });

  it("requires a provider name", () => {
    const result = validatePrasadamEntry({ ...valid, providerName: "  " });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/name/i);
  });

  it("rejects an impossible date rather than leaving it to the rules", () => {
    expect(validatePrasadamEntry({ ...valid, date: "2026-99-99" }).ok).toBe(false);
    expect(validatePrasadamEntry({ ...valid, date: "banana" }).ok).toBe(false);
  });

  it("rejects a missing or bad session", () => {
    expect(validatePrasadamEntry({ ...valid, session: undefined }).ok).toBe(false);
  });

  it("rejects non-positive, non-numeric and absurd quantities", () => {
    expect(validatePrasadamEntry({ ...valid, quantity: 0 }).ok).toBe(false);
    expect(validatePrasadamEntry({ ...valid, quantity: "abc" }).ok).toBe(false);
    expect(validatePrasadamEntry({ ...valid, quantity: 1e300 }).ok).toBe(false);
    expect(validatePrasadamEntry({ ...valid, quantity: -3 }).ok).toBe(false);
  });

  it("requires a unit, and a label when the unit is 'other'", () => {
    expect(validatePrasadamEntry({ ...valid, unit: undefined }).ok).toBe(false);
    expect(validatePrasadamEntry({ ...valid, unit: "other" }).ok).toBe(false);
    expect(validatePrasadamEntry({ ...valid, unit: "other", unitLabel: "dabba" }).ok).toBe(true);
  });

  it("parses the string a text input actually gives us", () => {
    expect(normalizeQuantity("5.5")).toBe(5.5);
    expect(normalizeQuantity("")).toBe(0);
    expect(normalizeQuantity("1e5")).toBeNull();
    expect(normalizeQuantity("abc")).toBeNull();
    expect(normalizeQuantity(Number.NaN)).toBeNull();
  });
});

describe("duplicate provider warning", () => {
  it("finds the same person already in this session", () => {
    const entries = [entry({ providerName: "Ravi", session: "morning" })];
    expect(
      findDuplicateProvider(entries, "2026-09-16", "morning", { providerName: "ravi" })
    ).toBeDefined();
  });

  it("does not warn across sessions or days", () => {
    const entries = [entry({ providerName: "Ravi", session: "morning" })];
    expect(
      findDuplicateProvider(entries, "2026-09-16", "evening", { providerName: "Ravi" })
    ).toBeUndefined();
    expect(
      findDuplicateProvider(entries, "2026-09-17", "morning", { providerName: "Ravi" })
    ).toBeUndefined();
  });

  it("ignores a cancelled entry", () => {
    const entries = [entry({ providerName: "Ravi", status: "cancelled" })];
    expect(
      findDuplicateProvider(entries, "2026-09-16", "morning", { providerName: "Ravi" })
    ).toBeUndefined();
  });
});
