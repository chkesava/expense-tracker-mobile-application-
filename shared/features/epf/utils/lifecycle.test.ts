import { describe, expect, it } from "vitest";

import type { EpfContribution } from "@/shared/features/epf/types";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";
import {
  applyActualCredit,
  applyAutoCredit,
  applyMissed,
  applyReversed,
  buildContributionEvent,
  canTransition,
  contributionsToAutoCredit,
  isCreditWindowPassed,
  isReconciled,
  projectionBlocker,
  summariseLifecycle,
} from "@/shared/features/epf/utils/lifecycle";

function contribution(overrides: Partial<EpfContribution> = {}): EpfContribution {
  return {
    id: "est-a_2026-08",
    establishmentId: "est-a",
    month: "2026-08",
    wage: 25000,
    employeeShare: 3000,
    employerShare: 3000,
    epsShare: 1250,
    employerEpfShare: 1750,
    totalContribution: 6000,
    epfCredit: 4750,
    status: "expected",
    source: "simulated",
    epsEligible: true,
    expectedCreditFrom: "2026-09-15",
    expectedCreditTo: "2026-09-25",
    ...overrides,
  };
}

describe("isCreditWindowPassed", () => {
  it("is false the day before the window closes", () => {
    expect(isCreditWindowPassed(contribution(), "2026-09-24")).toBe(false);
  });

  it("is false on the closing day itself — the window is inclusive", () => {
    expect(isCreditWindowPassed(contribution(), "2026-09-25")).toBe(false);
  });

  it("is true the day after", () => {
    expect(isCreditWindowPassed(contribution(), "2026-09-26")).toBe(true);
  });

  it("is false when no window was recorded", () => {
    expect(isCreditWindowPassed({ expectedCreditTo: undefined }, "2030-01-01")).toBe(false);
  });
});

describe("contributionsToAutoCredit", () => {
  it("advances only expected rows whose window has passed", () => {
    const rows = [
      contribution({ id: "a", month: "2026-08" }),
      contribution({ id: "b", month: "2026-09", expectedCreditTo: "2026-10-25" }),
    ];
    const due = contributionsToAutoCredit(rows, "2026-09-26");
    expect(due.map((row) => row.id)).toEqual(["a"]);
  });

  it("never touches a status the scheduler does not own", () => {
    const rows = [
      contribution({ status: "confirmed", source: "manualHistorical" }),
      contribution({ status: "credited" }),
      contribution({ status: "missed" }),
      contribution({ status: "draft" }),
      contribution({ status: "reversed" }),
    ];
    expect(contributionsToAutoCredit(rows, "2030-01-01")).toEqual([]);
  });

  it("is a no-op on a second pass — nothing is left expected", () => {
    const rows = [contribution()];
    const first = contributionsToAutoCredit(rows, "2026-09-26");
    expect(first).toHaveLength(1);

    const advanced = first.map((row) => applyAutoCredit(row));
    expect(contributionsToAutoCredit(advanced, "2026-09-26")).toEqual([]);
  });
});

describe("applyAutoCredit", () => {
  it("credits the month but leaves it unreconciled", () => {
    const row = applyAutoCredit(contribution());
    expect(row.status).toBe("credited");
    expect(row.reconciledAt).toBeUndefined();
    expect(isReconciled(row)).toBe(false);
  });

  it("does not invent a credited amount", () => {
    expect(applyAutoCredit(contribution()).creditedAmount).toBeUndefined();
  });

  it("reads as projected, not as fact", () => {
    const row = applyAutoCredit(contribution());
    const meta = contributionStatusMeta(row.status, row.source, isReconciled(row));
    expect(meta.label).toBe("Credited · projected");
    expect(meta.simulated).toBe(true);
  });
});

describe("applyActualCredit", () => {
  const reconciledAt = "2026-09-26T00:00:00.000Z";

  it("marks a full credit as credited and reconciled", () => {
    const row = applyActualCredit(contribution(), {
      amount: 4750,
      date: "2026-09-20",
      reconciledAt,
    });
    expect(row.status).toBe("credited");
    expect(row.creditedAmount).toBe(4750);
    expect(row.creditDate).toBe("2026-09-20");
    expect(isReconciled(row)).toBe(true);
  });

  it("reads as a plain fact once reconciled", () => {
    const row = applyActualCredit(contribution(), {
      amount: 4750,
      date: "2026-09-20",
      reconciledAt,
    });
    const meta = contributionStatusMeta(row.status, row.source, isReconciled(row));
    expect(meta.label).toBe("Credited");
    expect(meta.simulated).toBe(false);
  });

  it("makes a shortfall partial rather than rewriting the projection", () => {
    const row = applyActualCredit(contribution(), {
      amount: 3000,
      date: "2026-09-20",
      reconciledAt,
    });
    expect(row.status).toBe("partial");
    expect(row.creditedAmount).toBe(3000);
    expect(row.epfCredit).toBe(4750); // projection preserved
  });

  it("treats an over-credit as credited — arrears are normal, not an error", () => {
    const row = applyActualCredit(contribution(), {
      amount: 9500,
      date: "2026-09-20",
      reconciledAt,
    });
    expect(row.status).toBe("credited");
    expect(row.creditedAmount).toBe(9500);
  });

  it("clamps a negative amount to zero instead of inverting the month", () => {
    const row = applyActualCredit(contribution(), {
      amount: -100,
      date: "2026-09-20",
      reconciledAt,
    });
    expect(row.creditedAmount).toBe(0);
    expect(row.status).toBe("partial");
  });

  it("clears a stale reason from an earlier missed or reversed state", () => {
    const row = applyActualCredit(
      contribution({ status: "missed", statusReason: "not paid" }),
      { amount: 4750, date: "2026-09-20", reconciledAt }
    );
    expect(row.statusReason).toBeUndefined();
  });
});

describe("applyMissed and applyReversed", () => {
  const at = "2026-09-26T00:00:00.000Z";

  it("records a missed month with its reason and a zero credit", () => {
    const row = applyMissed(contribution(), "Employer did not remit", at);
    expect(row.status).toBe("missed");
    expect(row.creditedAmount).toBe(0);
    expect(row.statusReason).toBe("Employer did not remit");
    expect(isReconciled(row)).toBe(true);
  });

  it("records a reversal without zeroing the original projection", () => {
    const row = applyReversed(contribution({ status: "credited" }), "Reversed by EPFO", at);
    expect(row.status).toBe("reversed");
    expect(row.statusReason).toBe("Reversed by EPFO");
    expect(row.epfCredit).toBe(4750);
  });

  it("both are user-asserted — neither is reachable from the auto path", () => {
    const rows = [contribution(), contribution({ status: "credited" })];
    const due = contributionsToAutoCredit(rows, "2030-01-01");
    expect(due.every((row) => row.status === "expected")).toBe(true);
  });
});

describe("canTransition", () => {
  it("allows the automatic and user paths the lifecycle needs", () => {
    expect(canTransition("expected", "credited")).toBe(true);
    expect(canTransition("credited", "partial")).toBe(true);
    expect(canTransition("credited", "reversed")).toBe(true);
    expect(canTransition("expected", "missed")).toBe(true);
    expect(canTransition("missed", "credited")).toBe(true);
  });

  it("refuses to move a draft anywhere — KAN-66 owns that path", () => {
    expect(canTransition("draft", "credited")).toBe(false);
    expect(canTransition("draft", "reversed")).toBe(false);
  });

  it("refuses to reverse straight from expected — nothing was credited yet", () => {
    expect(canTransition("expected", "reversed")).toBe(false);
  });

  it("does not let a backfilled month be auto-credited", () => {
    expect(canTransition("confirmed", "credited")).toBe(false);
  });
});

describe("buildContributionEvent", () => {
  it("captures both ends of the transition and who caused it", () => {
    const event = buildContributionEvent(contribution(), "expected", "credited", {
      actor: "system",
      amount: 4750,
    });
    expect(event).toEqual({
      contributionId: "est-a_2026-08",
      establishmentId: "est-a",
      month: "2026-08",
      from: "expected",
      to: "credited",
      amount: 4750,
      actor: "system",
      reason: undefined,
    });
  });

  it("carries the reason for a user-asserted transition", () => {
    const event = buildContributionEvent(contribution(), "credited", "reversed", {
      actor: "user",
      reason: "Reversed by EPFO",
    });
    expect(event.actor).toBe("user");
    expect(event.reason).toBe("Reversed by EPFO");
  });
});

describe("summariseLifecycle", () => {
  it("counts each status and totals what landed", () => {
    const summary = summariseLifecycle([
      contribution({ status: "expected" }),
      contribution({ status: "credited" }),
      contribution({ status: "partial", creditedAmount: 2000, reconciledAt: "x" }),
      contribution({ status: "missed" }),
      contribution({ status: "reversed" }),
    ]);
    expect(summary.expected).toBe(1);
    expect(summary.credited).toBe(1);
    expect(summary.partial).toBe(1);
    expect(summary.missed).toBe(1);
    expect(summary.reversed).toBe(1);
    expect(summary.creditedTotal).toBe(6750); // 4750 projected + 2000 actual
  });

  it("prefers the actual amount over the projection where known", () => {
    const summary = summariseLifecycle([
      contribution({ status: "credited", creditedAmount: 1000, reconciledAt: "x" }),
    ]);
    expect(summary.creditedTotal).toBe(1000);
  });

  it("counts unconfirmed credited months so reconciliation has a target", () => {
    const summary = summariseLifecycle([
      contribution({ status: "credited" }),
      contribution({ status: "credited", reconciledAt: "x" }),
      contribution({ status: "expected" }),
    ]);
    expect(summary.unreconciled).toBe(1);
  });

  it("excludes missed and reversed months from the total", () => {
    const summary = summariseLifecycle([
      contribution({ status: "missed" }),
      contribution({ status: "reversed" }),
    ]);
    expect(summary.creditedTotal).toBe(0);
  });

  it("returns zeroes for an empty list", () => {
    expect(summariseLifecycle([]).creditedTotal).toBe(0);
  });
});

describe("projectionBlocker", () => {
  it("reports when there is no current employment", () => {
    expect(projectionBlocker({ hasCurrentEmployment: false, latestWage: 25000 })).toBe(
      "no_current_employment"
    );
  });

  it("reports a missing wage rather than projecting from nothing", () => {
    expect(projectionBlocker({ hasCurrentEmployment: true, latestWage: 0 })).toBe("no_wage");
  });

  it("is clear when everything needed is present", () => {
    expect(projectionBlocker({ hasCurrentEmployment: true, latestWage: 25000 })).toBeNull();
  });
});
