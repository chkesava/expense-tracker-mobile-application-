import { describe, expect, it } from "vitest";

import {
  persistedMonths,
  summarizeSaveResults,
  type EpfMonthSaveResult,
} from "@/shared/features/epf/utils/saveOutcome";

function results(
  ...rows: [string, EpfMonthSaveResult["outcome"]][]
): EpfMonthSaveResult[] {
  return rows.map(([month, outcome]) => ({ month, outcome }));
}

describe("summarizeSaveResults — SPENDLY-1", () => {
  it("reports nothing for an empty save", () => {
    const summary = summarizeSaveResults([]);
    expect(summary.message).toBe("");
    expect(summary.total).toBe(0);
    expect(summary.hasFailures).toBe(false);
  });

  it("counts every acked month, not just the last chunk", () => {
    const summary = summarizeSaveResults(
      results(["2026-06", "acked"], ["2026-07", "acked"], ["2026-08", "acked"])
    );
    expect(summary.saved).toBe(3);
    expect(summary.message).toBe("Saved 3 months");
    expect(summary.tone).toBe("success");
  });

  it("uses the singular only for one month", () => {
    expect(summarizeSaveResults(results(["2026-08", "acked"])).message).toBe(
      "Saved 1 month"
    );
  });

  it("promises a sync only when the queue is durable", () => {
    const summary = summarizeSaveResults(
      results(["2026-07", "queued"], ["2026-08", "queued"])
    );
    expect(summary.message).toBe("Saved 2 months — offline, will sync");
  });

  /**
   * The reported toast. "Saved 1 month — offline, will sync" was wrong twice:
   * the count came from a selection bug, and the promise came from a queue
   * that does not survive a force-stop on native (KAN-112).
   */
  it("never promises a sync for an unsafe write", () => {
    const summary = summarizeSaveResults(
      results(["2026-07", "unsafe"], ["2026-08", "unsafe"])
    );
    expect(summary.message).not.toContain("will sync");
    expect(summary.message).toBe(
      "Saved 2 months on this device — keep the app open until they sync."
    );
  });

  it("lets the weakest outcome describe a mixed save", () => {
    const summary = summarizeSaveResults(
      results(["2026-06", "acked"], ["2026-07", "unsafe"])
    );
    expect(summary.message).toContain("on this device");
  });

  it("never presents partial success as complete success", () => {
    const summary = summarizeSaveResults(
      results(["2026-06", "acked"], ["2026-07", "failed"], ["2026-08", "failed"])
    );
    expect(summary.tone).toBe("error");
    expect(summary.hasFailures).toBe(true);
    expect(summary.saved).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.message).toBe(
      "Saved 1 of 3 months. 2 could not be saved — try again."
    );
  });

  it("names the failed months for the retry banner, ascending", () => {
    const summary = summarizeSaveResults(
      results(["2026-08", "failed"], ["2026-06", "failed"], ["2026-07", "acked"])
    );
    expect(summary.failedMonths).toEqual(["2026-06", "2026-08"]);
  });

  it("reports a total failure without claiming anything was saved", () => {
    const summary = summarizeSaveResults(
      results(["2026-07", "failed"], ["2026-08", "failed"])
    );
    expect(summary.saved).toBe(0);
    expect(summary.message).toBe("Couldn't save 2 months. Try again.");
  });
});

describe("persistedMonths — SPENDLY-1", () => {
  it("keeps failed months dirty so Save all can retry them", () => {
    expect(
      persistedMonths(
        results(["2026-06", "acked"], ["2026-07", "failed"], ["2026-08", "queued"])
      )
    ).toEqual(["2026-06", "2026-08"]);
  });

  it("treats an unsafe month as saved — the write did reach the cache", () => {
    expect(persistedMonths(results(["2026-08", "unsafe"]))).toEqual(["2026-08"]);
  });
});
