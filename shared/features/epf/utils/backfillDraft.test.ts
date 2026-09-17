import { describe, expect, it } from "vitest";

import type {
  EpfBackfillRow,
  EpfContributionStatus,
} from "@/shared/features/epf/types";
import {
  BACKFILL_ARCHIVED_REASON,
  BACKFILL_DEMOTE_REASON,
  BACKFILL_REFUSED_REASON,
  backfillRowPresentation,
  backfillSaveRows,
  backfillStatusLabel,
  clearSavedEdits,
  contributionRemovalKind,
  mergeBackfillEdits,
  persistedAmountsDiffer,
  resolveBackfillSaveStatus,
  statusForAppliedEdit,
  unsavedBackfillSummary,
  unsavedChangesPrompt,
  upsertBackfillEdit,
} from "@/shared/features/epf/utils/backfillDraft";
import { canTransition } from "@/shared/features/epf/utils/lifecycle";

const ALL_STATUSES: EpfContributionStatus[] = [
  "draft",
  "confirmed",
  "expected",
  "credited",
  "partial",
  "missed",
  "reversed",
];

function row(overrides: Partial<EpfBackfillRow> = {}): EpfBackfillRow {
  return {
    establishmentId: "est-a",
    month: "2026-08",
    wage: 25000,
    employeeShare: 3000,
    employerShare: 3000,
    epsShare: 1250,
    employerEpfShare: 1750,
    totalContribution: 6000,
    epfCredit: 4750,
    status: "draft",
    source: "manualHistorical",
    epsEligible: true,
    persisted: false,
    ...overrides,
  };
}

describe("mergeBackfillEdits", () => {
  it("overlays an edit onto the generated row for that month", () => {
    const generated = [row({ month: "2026-07" }), row({ month: "2026-08" })];
    const edits = new Map([["2026-08", row({ month: "2026-08", wage: 40000 })]]);

    expect(mergeBackfillEdits(generated, edits).map((r) => r.wage)).toEqual([25000, 40000]);
  });

  it("preserves generated order", () => {
    const generated = [
      row({ month: "2026-06" }),
      row({ month: "2026-07" }),
      row({ month: "2026-08" }),
    ];
    const edits = new Map([["2026-06", row({ month: "2026-06", wage: 1 })]]);

    expect(mergeBackfillEdits(generated, edits).map((r) => r.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("returns the generated list unchanged when there are no edits", () => {
    const generated = [row()];
    expect(mergeBackfillEdits(generated, new Map())).toBe(generated);
  });

  it("ignores an edit for a month that is not generated", () => {
    const generated = [row({ month: "2026-08" })];
    const edits = new Map([["2030-01", row({ month: "2030-01" })]]);
    expect(mergeBackfillEdits(generated, edits)).toHaveLength(1);
  });
});

describe("upsertBackfillEdit", () => {
  it("returns a new Map rather than mutating", () => {
    const edits = new Map<string, EpfBackfillRow>();
    const next = upsertBackfillEdit(edits, row());

    expect(next).not.toBe(edits);
    expect(edits.size).toBe(0);
    expect(next.get("2026-08")?.month).toBe("2026-08");
  });

  it("replaces an existing edit for the same month", () => {
    const first = upsertBackfillEdit(new Map(), row({ wage: 100 }));
    const second = upsertBackfillEdit(first, row({ wage: 200 }));

    expect(second.size).toBe(1);
    expect(second.get("2026-08")?.wage).toBe(200);
  });
});

describe("clearSavedEdits", () => {
  it("drops the saved months", () => {
    const edits = new Map([
      ["2026-07", row({ month: "2026-07" })],
      ["2026-08", row({ month: "2026-08" })],
    ]);

    expect([...clearSavedEdits(edits, ["2026-07"]).keys()]).toEqual(["2026-08"]);
  });

  it("returns a new identity even when nothing was removed", () => {
    // The list's extraData keys off edits.size, so a same-size swap must still
    // be a new object or the rows will not re-render.
    const edits = new Map([["2026-08", row()]]);
    expect(clearSavedEdits(edits, ["2030-01"])).not.toBe(edits);
  });

  it("is a new identity when one month is saved and another edited", () => {
    const before = new Map([["2026-07", row({ month: "2026-07" })]]);
    const after = upsertBackfillEdit(clearSavedEdits(before, ["2026-07"]), row());

    expect(after.size).toBe(before.size);
    expect(after).not.toBe(before);
    expect([...after.keys()]).toEqual(["2026-08"]);
  });
});

describe("statusForAppliedEdit", () => {
  it("makes a brand-new month a draft", () => {
    expect(statusForAppliedEdit(row({ persisted: false }))).toBe("draft");
  });

  it("never demotes a persisted month", () => {
    // Applying an edit to a confirmed month used to send "draft", which would
    // have silently reverted user-asserted history.
    expect(statusForAppliedEdit(row({ persisted: true, status: "confirmed" }))).toBe(
      "confirmed"
    );
    expect(statusForAppliedEdit(row({ persisted: true, status: "credited" }))).toBe(
      "credited"
    );
    expect(statusForAppliedEdit(row({ persisted: true, status: "partial" }))).toBe(
      "partial"
    );
  });

  it("only ever returns the current status or a legal transition", () => {
    // The machine-checked form of "does not make SPENDLY-15 worse": this keeps
    // holding when saveContributions starts enforcing canTransition.
    for (const status of ALL_STATUSES) {
      const next = statusForAppliedEdit(row({ persisted: true, status }));
      expect(next === status || canTransition(status, next)).toBe(true);
    }
  });
});

describe("resolveBackfillSaveStatus — SPENDLY-15", () => {
  it("lets a new month become draft or confirmed", () => {
    expect(resolveBackfillSaveStatus({ requested: "draft" })).toEqual({
      ok: true,
      status: "draft",
    });
    expect(resolveBackfillSaveStatus({ requested: "confirmed" })).toEqual({
      ok: true,
      status: "confirmed",
    });
  });

  it("promotes a draft to confirmed and refuses any other landing", () => {
    expect(
      resolveBackfillSaveStatus({ existingStatus: "draft", requested: "confirmed" })
    ).toEqual({ ok: true, status: "confirmed" });
    expect(
      resolveBackfillSaveStatus({ existingStatus: "draft", requested: "credited" })
    ).toEqual({ ok: false, reason: BACKFILL_REFUSED_REASON });
  });

  it("refuses to demote a confirmed month to draft", () => {
    expect(
      resolveBackfillSaveStatus({ existingStatus: "confirmed", requested: "draft" })
    ).toEqual({ ok: false, reason: BACKFILL_DEMOTE_REASON });
  });

  it("lets amount edits rewrite a confirmed month as confirmed", () => {
    expect(
      resolveBackfillSaveStatus({ existingStatus: "confirmed", requested: "confirmed" })
    ).toEqual({ ok: true, status: "confirmed" });
  });

  it("refuses credited, expected, and other lifecycle rows", () => {
    for (const status of ["expected", "credited", "partial", "missed", "reversed"] as const) {
      expect(
        resolveBackfillSaveStatus({ existingStatus: status, requested: "confirmed" })
      ).toEqual({ ok: false, reason: BACKFILL_REFUSED_REASON });
    }
  });

  it("refuses an archived month", () => {
    expect(
      resolveBackfillSaveStatus({
        existingStatus: "confirmed",
        archived: true,
        requested: "confirmed",
      })
    ).toEqual({ ok: false, reason: BACKFILL_ARCHIVED_REASON });
  });
});

describe("contributionRemovalKind — SPENDLY-15", () => {
  it("hard-deletes drafts and archives everything else", () => {
    expect(contributionRemovalKind({ status: "draft" })).toBe("delete");
    expect(contributionRemovalKind({ status: "confirmed" })).toBe("archive");
    expect(contributionRemovalKind({ status: "credited" })).toBe("archive");
    expect(contributionRemovalKind({ status: "expected" })).toBe("archive");
  });

  it("does not touch a missing or already-archived row", () => {
    expect(contributionRemovalKind(undefined)).toBe("missing");
    expect(contributionRemovalKind({ status: "confirmed", archived: true })).toBe("missing");
  });
});

describe("unsavedBackfillSummary", () => {
  it("is clean on a pristine screen", () => {
    const summary = unsavedBackfillSummary({ edits: new Map(), wage: "" });
    expect(summary.dirty).toBe(false);
    expect(summary.label).toBe("");
  });

  it("is dirty with a typed wage and no edits", () => {
    const summary = unsavedBackfillSummary({ edits: new Map(), wage: "25000" });
    expect(summary.dirty).toBe(true);
    expect(summary.count).toBe(0);
  });

  it("is dirty with edits and no wage", () => {
    const summary = unsavedBackfillSummary({
      edits: new Map([["2026-08", row()]]),
      wage: "",
    });
    expect(summary.dirty).toBe(true);
    expect(summary.count).toBe(1);
  });

  it("is clean for a zero or unparseable wage", () => {
    expect(unsavedBackfillSummary({ edits: new Map(), wage: "0" }).dirty).toBe(false);
    expect(unsavedBackfillSummary({ edits: new Map(), wage: "abc" }).dirty).toBe(false);
  });

  it("uses one pluralisation branch, not a hand-rolled one per call site", () => {
    expect(unsavedBackfillSummary({ edits: new Map([["a", row()]]), wage: "" }).label).toBe(
      "1 unsaved month"
    );
    expect(
      unsavedBackfillSummary({
        edits: new Map([
          ["a", row()],
          ["b", row()],
        ]),
        wage: "",
      }).label
    ).toBe("2 unsaved months");
  });

  it("is clean once the typed wage has been saved", () => {
    // Otherwise every tab switch after a Save draft would prompt about work
    // that is already durable.
    expect(
      unsavedBackfillSummary({ edits: new Map(), wage: "25000", savedWage: "25000" }).dirty
    ).toBe(false);
  });

  it("is dirty again when the wage changes after a save", () => {
    expect(
      unsavedBackfillSummary({ edits: new Map(), wage: "30000", savedWage: "25000" }).dirty
    ).toBe(true);
  });

  it("stays dirty after a save while an edit is still pending", () => {
    expect(
      unsavedBackfillSummary({
        edits: new Map([["2026-08", row()]]),
        wage: "25000",
        savedWage: "25000",
      }).dirty
    ).toBe(true);
  });

  it("sorts the months", () => {
    const summary = unsavedBackfillSummary({
      edits: new Map([
        ["2026-08", row({ month: "2026-08" })],
        ["2026-06", row({ month: "2026-06" })],
      ]),
      wage: "",
    });
    expect(summary.months).toEqual(["2026-06", "2026-08"]);
  });
});

describe("unsavedChangesPrompt", () => {
  it("names the month count when there are edits", () => {
    const summary = unsavedBackfillSummary({
      edits: new Map([["2026-08", row()]]),
      wage: "",
    });
    expect(unsavedChangesPrompt(summary).message).toContain("1 unsaved month");
  });

  it("falls back to wage wording when only the wage is dirty", () => {
    const summary = unsavedBackfillSummary({ edits: new Map(), wage: "25000" });
    expect(unsavedChangesPrompt(summary).message).toContain("wage");
  });
});

describe("backfillSaveRows — SPENDLY-68", () => {
  it("never rewrites a persisted month just because a wage is typed", () => {
    const rows = [
      row({ month: "2025-12", persisted: true, status: "confirmed", employeeShare: 2099 }),
      row({ month: "2025-11", persisted: false, wage: 17494, employeeShare: 2099 }),
    ];
    const payload = backfillSaveRows({
      rows,
      edits: new Map(),
      wage: 17494,
      status: "confirmed",
    });

    expect(payload.map((r) => r.month)).toEqual(["2025-11"]);
  });

  it("includes edited months even when they are already persisted", () => {
    const edited = row({ month: "2025-12", persisted: true, employeeShare: 1287 });
    const payload = backfillSaveRows({
      rows: [row({ month: "2025-12", persisted: true, employeeShare: 2099 })],
      edits: new Map([["2025-12", edited]]),
      wage: 17494,
      status: "confirmed",
    });

    expect(payload).toHaveLength(1);
    expect(payload[0].employeeShare).toBe(1287);
  });

  it("does not include an edit of a credited month — SPENDLY-15", () => {
    const payload = backfillSaveRows({
      rows: [row({ month: "2025-12", persisted: true, status: "credited" })],
      edits: new Map([
        ["2025-12", row({ month: "2025-12", persisted: true, status: "credited", wage: 1 })],
      ]),
      wage: 17494,
      status: "confirmed",
    });
    expect(payload).toEqual([]);
  });

  it("skips empty suggestions when no wage is set", () => {
    expect(
      backfillSaveRows({
        rows: [row({ month: "2025-12", persisted: false, wage: 0 })],
        edits: new Map(),
        wage: 0,
        status: "draft",
      })
    ).toEqual([]);
  });

  /**
   * The reported bug. `applyEdit` persists each edited month as a `draft`, so
   * after a few edits every month is `persisted`; skipping all persisted rows
   * left Save all writing only the leftover wage-filled one.
   */
  it("promotes a persisted draft when saving as confirmed", () => {
    const payload = backfillSaveRows({
      rows: [
        row({ month: "2026-06", persisted: true, status: "draft" }),
        row({ month: "2026-07", persisted: true, status: "draft" }),
        row({ month: "2026-08", persisted: false, wage: 25000 }),
      ],
      edits: new Map(),
      wage: 25000,
      status: "confirmed",
    });

    expect(payload.map((r) => r.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("does not rewrite a persisted draft when saving as draft", () => {
    expect(
      backfillSaveRows({
        rows: [row({ month: "2026-06", persisted: true, status: "draft" })],
        edits: new Map(),
        wage: 0,
        status: "draft",
      })
    ).toEqual([]);
  });

  it("never promotes a persisted month that is not a draft — SPENDLY-68 holds", () => {
    const protectedStatuses = ALL_STATUSES.filter((status) => status !== "draft");
    for (const status of protectedStatuses) {
      const payload = backfillSaveRows({
        rows: [row({ month: "2026-06", persisted: true, status })],
        edits: new Map(),
        wage: 25000,
        status: "confirmed",
      });
      expect(payload, `status ${status} must not be rewritten`).toEqual([]);
    }
  });
});

describe("backfillStatusLabel — SPENDLY-1", () => {
  it("marks a persisted draft as saved", () => {
    const presentation = backfillRowPresentation(
      row({ persisted: true, status: "draft" })
    );
    expect(presentation.savedDraft).toBe(true);
    expect(backfillStatusLabel("Draft", presentation)).toBe("Draft · saved");
  });

  it("leaves an unsaved generated month alone", () => {
    const presentation = backfillRowPresentation(
      row({ persisted: false, status: "draft" })
    );
    expect(presentation.savedDraft).toBe(false);
    expect(backfillStatusLabel("Draft", presentation)).toBe("Draft");
  });

  it("does not label a persisted confirmed month as a draft", () => {
    const presentation = backfillRowPresentation(
      row({ persisted: true, status: "confirmed" })
    );
    expect(backfillStatusLabel("Manual", presentation)).toBe("Manual");
  });
});

describe("persistedAmountsDiffer — SPENDLY-68", () => {
  it("is false when wage and shares match", () => {
    const a = row({ wage: 17494, employeeShare: 2099, employerShare: 2099, epsShare: 0 });
    expect(persistedAmountsDiffer(a, { ...a })).toBe(false);
  });

  it("is true when any share or wage changes", () => {
    const saved = row({ wage: 17494, employeeShare: 2099, employerShare: 2099, epsShare: 0 });
    expect(
      persistedAmountsDiffer(saved, { ...saved, employeeShare: 1287 })
    ).toBe(true);
    expect(persistedAmountsDiffer(saved, { ...saved, wage: 10000 })).toBe(true);
  });
});

describe("backfillRowPresentation — SPENDLY-69", () => {
  it("marks a saved month as recorded and not suggested", () => {
    expect(backfillRowPresentation(row({ persisted: true, epfCredit: 2948 }))).toEqual({
      recorded: true,
      suggested: false,
      savedDraft: true,
    });
  });

  it("marks a wage-filled unsaved month as a suggestion", () => {
    expect(backfillRowPresentation(row({ persisted: false, epfCredit: 2948 }))).toEqual({
      recorded: true,
      suggested: true,
      savedDraft: false,
    });
  });

  it("marks an untouched month as neither", () => {
    expect(backfillRowPresentation(row({ persisted: false, epfCredit: 0 }))).toEqual({
      recorded: false,
      suggested: false,
      savedDraft: false,
    });
  });

  it("treats a saved non-remitting month as recorded", () => {
    // A stored zeroReason month is a document History counts, not a suggestion.
    expect(backfillRowPresentation(row({ persisted: true, epfCredit: 0 }))).toEqual({
      recorded: true,
      suggested: false,
      savedDraft: true,
    });
  });
});
