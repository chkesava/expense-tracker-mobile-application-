import { describe, expect, it } from "vitest";

import type { PrasadamEntry } from "@/shared/types/ganeshPrasadam";
import {
  buildPrasadamExport,
  prasadamExportRows,
  prasadamFileName,
  prasadamToCsv,
  prasadamToHtml,
} from "@/shared/utils/ganeshPrasadamExport";

let seq = 0;

function entry(over: Partial<PrasadamEntry> = {}): PrasadamEntry {
  seq += 1;
  return {
    id: over.id ?? `e${seq}`,
    date: "2026-09-16",
    session: "morning",
    providerName: "Ravi",
    prasadamType: "sweet",
    prasadamLabel: "Laddu",
    quantity: 500,
    unit: "pieces",
    status: "recorded",
    createdBy: "u1",
    updatedBy: "u1",
    createdAt: { seconds: seq, nanoseconds: 0 },
    ...over,
  } as PrasadamEntry;
}

const BASE = {
  pandalName: "Telephone Colony Mandal",
  festivalName: "Ganesh Utsav",
  festivalYear: 2026,
  generatedAt: "2026-09-17T10:00:00.000Z",
  generatedBy: "A committee member",
};

describe("building the register", () => {
  it("gives every provider their own row, never collapsing a session", () => {
    const model = buildPrasadamExport({
      ...BASE,
      entries: [
        entry({ providerName: "Ravi" }),
        entry({ providerName: "Suresh" }),
        entry({ providerName: "Anjali" }),
      ],
    });

    expect(model.days).toHaveLength(1);
    expect(model.days[0].morning.rows.map((r) => r.providerName)).toEqual([
      "Ravi",
      "Suresh",
      "Anjali",
    ]);
    expect(model.totals.entryCount).toBe(3);
  });

  it("orders day ascending, morning before evening, oldest first", () => {
    const model = buildPrasadamExport({
      ...BASE,
      entries: [
        entry({ id: "d2m", date: "2026-09-17", session: "morning", createdAt: { seconds: 40, nanoseconds: 0 } }),
        entry({ id: "d1e", date: "2026-09-16", session: "evening", createdAt: { seconds: 30, nanoseconds: 0 } }),
        entry({ id: "d1m2", date: "2026-09-16", session: "morning", createdAt: { seconds: 20, nanoseconds: 0 } }),
        entry({ id: "d1m1", date: "2026-09-16", session: "morning", createdAt: { seconds: 10, nanoseconds: 0 } }),
      ],
    });

    expect(model.days.map((d) => d.date)).toEqual(["2026-09-16", "2026-09-17"]);
    expect(prasadamExportRows(model).map((r) => r.entryId)).toEqual([
      "d1m1",
      "d1m2",
      "d1e",
      "d2m",
    ]);
  });

  it("does not reshuffle when new entries arrive", () => {
    const first = [
      entry({ id: "a", createdAt: { seconds: 10, nanoseconds: 0 } }),
      entry({ id: "b", createdAt: { seconds: 20, nanoseconds: 0 } }),
    ];
    const before = prasadamExportRows(
      buildPrasadamExport({ ...BASE, entries: first })
    ).map((r) => r.entryId);

    const after = prasadamExportRows(
      buildPrasadamExport({
        ...BASE,
        entries: [...first, entry({ id: "c", createdAt: { seconds: 30, nanoseconds: 0 } })],
      })
    ).map((r) => r.entryId);

    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("reports quantities per unit and offers no grand total", () => {
    const model = buildPrasadamExport({
      ...BASE,
      entries: [
        entry({ quantity: 5, unit: "kg" }),
        entry({ quantity: 30, unit: "pieces" }),
        entry({ quantity: 2, unit: "kg" }),
      ],
    });

    expect(model.totals.byUnit).toEqual([
      { unit: "kg", unitLabel: undefined, quantity: 7, entryCount: 2 },
      { unit: "pieces", unitLabel: undefined, quantity: 30, entryCount: 1 },
    ]);
    expect(model.totals).not.toHaveProperty("totalQuantity");
  });

  it("keeps cancelled rows but leaves them out of the quantities", () => {
    const model = buildPrasadamExport({
      ...BASE,
      entries: [
        entry({ quantity: 5, unit: "kg" }),
        entry({ providerName: "Gone", quantity: 3, unit: "kg", status: "cancelled" }),
      ],
    });

    expect(model.days[0].morning.rows).toHaveLength(2);
    expect(model.days[0].morning.rows[1].status).toBe("cancelled");
    expect(model.totals.byUnit[0].quantity).toBe(5);
    expect(model.totals.cancelledCount).toBe(1);
  });

  it("counts a provider once across both sessions of a day", () => {
    const model = buildPrasadamExport({
      ...BASE,
      entries: [
        entry({ providerName: "Ravi", session: "morning" }),
        entry({ providerName: "Ravi", session: "evening" }),
      ],
    });
    expect(model.totals.entryCount).toBe(2);
    expect(model.totals.providerCount).toBe(1);
  });

  it("carries the festival day number when the festival has a window", () => {
    const model = buildPrasadamExport({
      ...BASE,
      entries: [entry({ date: "2026-09-18" })],
      dayNumberOf: (date) => (date === "2026-09-18" ? 3 : undefined),
    });
    expect(model.days[0].dayNumber).toBe(3);
  });
});

describe("HTML", () => {
  it("escapes a provider name that looks like markup", () => {
    const html = prasadamToHtml(
      buildPrasadamExport({
        ...BASE,
        entries: [entry({ providerName: "<script>alert(1)</script>" })],
      })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("repeats the table header across printed pages and never splits a row", () => {
    const html = prasadamToHtml(buildPrasadamExport({ ...BASE, entries: [entry()] }));
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("page-break-inside: avoid");
  });

  it("carries no rupee sign anywhere — this register holds no money", () => {
    const html = prasadamToHtml(
      buildPrasadamExport({ ...BASE, entries: [entry(), entry({ unit: "kg", quantity: 4 })] })
    );
    expect(html).not.toContain("₹");
  });

  it("says so plainly when nothing has been recorded", () => {
    const html = prasadamToHtml(buildPrasadamExport({ ...BASE, entries: [] }));
    expect(html).toContain("No prasadam has been recorded yet.");
  });

  it("states the filter when one produced the document", () => {
    const html = prasadamToHtml(
      buildPrasadamExport({
        ...BASE,
        entries: [entry()],
        filterSummary: "Morning only",
      })
    );
    expect(html).toContain("Morning only");
  });
});

describe("CSV", () => {
  it("writes one row per entry and no totals row", () => {
    const csv = prasadamToCsv(
      buildPrasadamExport({
        ...BASE,
        entries: [
          entry({ providerName: "Ravi" }),
          entry({ providerName: "Suresh", session: "evening" }),
        ],
      })
    );
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3); // header + two entries
    expect(lines[0]).toContain("Provider");
    expect(lines[1]).toContain("Ravi");
    expect(lines[2]).toContain("Suresh");
    expect(csv).not.toMatch(/total/i);
  });

  it("quotes a note containing a comma", () => {
    const csv = prasadamToCsv(
      buildPrasadamExport({
        ...BASE,
        entries: [entry({ notes: "Brought early, left at the counter" })],
      })
    );
    expect(csv).toContain('"Brought early, left at the counter"');
  });
});

describe("file name", () => {
  it("says what it is without being opened", () => {
    const model = buildPrasadamExport({ ...BASE, entries: [entry()] });
    expect(prasadamFileName(model)).toBe(
      "Telephone-Colony-Mandal-prasadam-2026-09-17.pdf"
    );
    expect(prasadamFileName(model, "csv")).toBe(
      "Telephone-Colony-Mandal-prasadam-2026-09-17.csv"
    );
  });
});
