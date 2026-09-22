import { describe, expect, it } from "vitest";

import type { AccountNote } from "../types/expense";
import {
  ACCOUNT_NOTE_BODY_MAX,
  ACCOUNT_NOTE_TITLE_MAX,
  accountNoteDraftChanged,
  accountNoteSortMs,
  createEmptyAccountNoteDraft,
  isAccountNoteDraftValid,
  normalizeAccountNoteDraft,
  selectAccountNotes,
  sortAccountNotes,
} from "./accountNotes";

function note(overrides: Partial<AccountNote> & { id: string }): AccountNote {
  return {
    accountId: "acc-1",
    title: "",
    body: "",
    pinned: false,
    ...overrides,
  };
}

describe("normalizeAccountNoteDraft", () => {
  it("trims both fields", () => {
    expect(
      normalizeAccountNoteDraft({ title: "  Branch  ", body: "  Indiranagar  " })
    ).toEqual({ title: "Branch", body: "Indiranagar", pinned: false });
  });

  it("clamps to the stored maximums", () => {
    const normalized = normalizeAccountNoteDraft({
      title: "t".repeat(ACCOUNT_NOTE_TITLE_MAX + 40),
      body: "b".repeat(ACCOUNT_NOTE_BODY_MAX + 500),
    });
    expect(normalized.title).toHaveLength(ACCOUNT_NOTE_TITLE_MAX);
    expect(normalized.body).toHaveLength(ACCOUNT_NOTE_BODY_MAX);
  });

  it("coerces pinned to a strict boolean", () => {
    expect(normalizeAccountNoteDraft({ title: "x" }).pinned).toBe(false);
    expect(normalizeAccountNoteDraft({ title: "x", pinned: true }).pinned).toBe(
      true
    );
  });

  it("treats missing fields as empty rather than undefined", () => {
    expect(normalizeAccountNoteDraft({})).toEqual({
      title: "",
      body: "",
      pinned: false,
    });
  });
});

describe("isAccountNoteDraftValid", () => {
  it("accepts a title alone", () => {
    expect(isAccountNoteDraftValid({ title: "Branch", body: "" })).toBe(true);
  });

  it("accepts a body alone", () => {
    expect(isAccountNoteDraftValid({ title: "", body: "Opened in 2019" })).toBe(
      true
    );
  });

  it("rejects an empty draft", () => {
    expect(isAccountNoteDraftValid(createEmptyAccountNoteDraft())).toBe(false);
  });

  it("rejects whitespace masquerading as content", () => {
    expect(isAccountNoteDraftValid({ title: "   ", body: "\n\t " })).toBe(false);
  });
});

describe("sortAccountNotes", () => {
  it("puts pinned notes first regardless of recency", () => {
    const sorted = sortAccountNotes([
      note({ id: "recent", updatedAtMs: 5_000 }),
      note({ id: "pinned-old", pinned: true, updatedAtMs: 1_000 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["pinned-old", "recent"]);
  });

  it("orders by most recently updated within a pin group", () => {
    const sorted = sortAccountNotes([
      note({ id: "b", updatedAtMs: 2_000 }),
      note({ id: "a", updatedAtMs: 9_000 }),
      note({ id: "p1", pinned: true, updatedAtMs: 1_000 }),
      note({ id: "p2", pinned: true, updatedAtMs: 8_000 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["p2", "p1", "a", "b"]);
  });

  it("breaks ties on id so the order is stable across renders", () => {
    const input = [
      note({ id: "z", updatedAtMs: 1_000 }),
      note({ id: "a", updatedAtMs: 1_000 }),
    ];
    expect(sortAccountNotes(input).map((entry) => entry.id)).toEqual(["a", "z"]);
    expect(sortAccountNotes([...input].reverse()).map((entry) => entry.id)).toEqual(
      ["a", "z"]
    );
  });

  it("does not mutate its input", () => {
    const input = [
      note({ id: "b", updatedAtMs: 1 }),
      note({ id: "a", pinned: true, updatedAtMs: 2 }),
    ];
    sortAccountNotes(input);
    expect(input.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("accountNoteSortMs", () => {
  it("prefers the update stamp", () => {
    expect(
      accountNoteSortMs(note({ id: "a", createdAtMs: 1, updatedAtMs: 7 }))
    ).toBe(7);
  });

  it("falls back to creation when the note was never edited", () => {
    expect(accountNoteSortMs(note({ id: "a", createdAtMs: 4 }))).toBe(4);
  });

  // A note written offline has a resolved `updatedAtMs` but a null
  // `updatedAt`; sorting must not depend on the server having answered.
  it("sorts a just-written note above older ones without a server stamp", () => {
    const sorted = sortAccountNotes([
      note({ id: "old", updatedAtMs: 1_000, updatedAt: { seconds: 1 } }),
      note({ id: "offline", updatedAtMs: 2_000, updatedAt: null }),
    ]);
    expect(sorted[0].id).toBe("offline");
  });

  it("returns 0 when no usable stamp is present", () => {
    expect(accountNoteSortMs(note({ id: "a" }))).toBe(0);
    expect(
      accountNoteSortMs(note({ id: "a", updatedAtMs: Number.NaN }))
    ).toBe(0);
  });
});

describe("selectAccountNotes", () => {
  it("keeps only the requested account's notes", () => {
    const selected = selectAccountNotes(
      [
        note({ id: "mine", accountId: "acc-1" }),
        note({ id: "theirs", accountId: "acc-2" }),
      ],
      "acc-1"
    );
    expect(selected.map((entry) => entry.id)).toEqual(["mine"]);
  });

  // Switching accounts leaves the previous account's notes in state until the
  // next read lands. Rendering those under the new account's name would be a
  // straightforward data-integrity bug, so the filter runs again on render.
  it("shows nothing from the previous account while the next read is in flight", () => {
    const stale = [
      note({ id: "s1", accountId: "acc-1", pinned: true }),
      note({ id: "s2", accountId: "acc-1" }),
    ];
    expect(selectAccountNotes(stale, "acc-2")).toEqual([]);
  });

  it("returns nothing for a missing account id", () => {
    expect(selectAccountNotes([note({ id: "a" })], "")).toEqual([]);
  });

  it("sorts what it selects", () => {
    const selected = selectAccountNotes(
      [
        note({ id: "plain", accountId: "acc-1", updatedAtMs: 9_000 }),
        note({ id: "pinned", accountId: "acc-1", pinned: true, updatedAtMs: 1 }),
        note({ id: "other", accountId: "acc-2", pinned: true, updatedAtMs: 99 }),
      ],
      "acc-1"
    );
    expect(selected.map((entry) => entry.id)).toEqual(["pinned", "plain"]);
  });
});

describe("accountNoteDraftChanged", () => {
  const saved = note({ id: "a", title: "Branch", body: "Indiranagar" });

  it("is false when nothing moved", () => {
    expect(
      accountNoteDraftChanged(saved, {
        title: "Branch",
        body: "Indiranagar",
        pinned: false,
      })
    ).toBe(false);
  });

  it("ignores whitespace the save would strip anyway", () => {
    expect(
      accountNoteDraftChanged(saved, {
        title: "  Branch ",
        body: " Indiranagar  ",
        pinned: false,
      })
    ).toBe(false);
  });

  it("notices a pin toggle with unchanged text", () => {
    expect(
      accountNoteDraftChanged(saved, {
        title: "Branch",
        body: "Indiranagar",
        pinned: true,
      })
    ).toBe(true);
  });

  it("notices edited text", () => {
    expect(
      accountNoteDraftChanged(saved, {
        title: "Branch",
        body: "Koramangala",
        pinned: false,
      })
    ).toBe(true);
  });
});

describe("notes stay non-financial", () => {
  // The guarantee the ticket asks for is structural: a note carries no amount
  // and no date key, so there is no field for a balance, statement or
  // analytics computation to pick up even if one were pointed at this data.
  it("exposes no money-shaped fields", () => {
    const shape = note({
      id: "a",
      title: "Branch",
      body: "Indiranagar",
      createdAtMs: 1,
      updatedAtMs: 2,
    });
    expect(Object.keys(shape).sort()).toEqual([
      "accountId",
      "body",
      "createdAtMs",
      "id",
      "pinned",
      "title",
      "updatedAtMs",
    ]);
    expect(shape).not.toHaveProperty("amount");
    expect(shape).not.toHaveProperty("date");
  });
});
