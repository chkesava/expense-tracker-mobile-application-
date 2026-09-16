import { describe, expect, it } from "vitest";

import type {
  EpfContribution,
  EpfContributionStatus,
} from "@/shared/features/epf/types";
import { contributionStatusMeta } from "@/shared/features/epf/utils/contributions";
import { deriveMonthState } from "@/shared/features/epf/utils/monthState";
import {
  applyActualCredit,
  applyMissed,
  applyReversed,
  buildContributionEvent,
  canRecordCredit,
  canTransition,
  isReconciled,
  projectionBlocker,
  transitionRejectionMessage,
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
    // The row is credited, so the calendar reading is just the stored status.
    const meta = contributionStatusMeta(
      deriveMonthState(row, "2026-09-26", "2026-09"),
      row.source,
      { reconciled: isReconciled(row) }
    );
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
    const missed = applyActualCredit(
      contribution({ status: "missed", statusReason: "not paid" }),
      { amount: 4750, date: "2026-09-20", reconciledAt }
    );
    expect(missed.statusReason).toBeUndefined();

    const reversed = applyActualCredit(
      contribution({ status: "reversed", statusReason: "Reversed by EPFO" }),
      { amount: 4750, date: "2026-09-20", reconciledAt }
    );
    expect(reversed.statusReason).toBeUndefined();
    expect(reversed.status).toBe("credited");
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

  it("both are user-asserted — nothing in the module reaches them on its own", () => {
    // SPENDLY-72 removed the only automatic transition there was. If a future
    // change adds one back, this is the assertion that should stop it.
    expect(canTransition("expected", "missed")).toBe(true);
    expect(canTransition("expected", "reversed")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows the user paths the lifecycle needs", () => {
    expect(canTransition("expected", "credited")).toBe(true);
    expect(canTransition("credited", "partial")).toBe(true);
    expect(canTransition("credited", "reversed")).toBe(true);
    expect(canTransition("expected", "missed")).toBe(true);
    expect(canTransition("missed", "credited")).toBe(true);
  });

  it("refuses to move a draft anywhere — KAN-66 owns that path", () => {
    expect(canTransition("draft", "credited")).toBe(false);
    expect(canTransition("draft", "partial")).toBe(false);
    expect(canTransition("draft", "reversed")).toBe(false);
  });

  it("refuses to reverse straight from expected — nothing was credited yet", () => {
    expect(canTransition("expected", "reversed")).toBe(false);
  });

  it("lets a backfilled month take the credit that actually landed — SPENDLY-72", () => {
    // The reported bug: a current month saved from Backfill read "Manual" and
    // had no way out, so the real credit could never be recorded against it.
    expect(canTransition("confirmed", "credited")).toBe(true);
    expect(canTransition("confirmed", "partial")).toBe(true);
  });

  it("still lets a backfilled month be marked missed or reversed", () => {
    expect(canTransition("confirmed", "missed")).toBe(true);
    expect(canTransition("confirmed", "reversed")).toBe(true);
  });

  it("lets a reversed month take the credit that came back — SPENDLY-77", () => {
    expect(canTransition("reversed", "credited")).toBe(true);
    expect(canTransition("reversed", "partial")).toBe(true);
  });

  it("still refuses every other way out of reversed", () => {
    expect(canTransition("reversed", "missed")).toBe(false);
    expect(canTransition("reversed", "expected")).toBe(false);
    expect(canTransition("reversed", "draft")).toBe(false);
    expect(canTransition("reversed", "confirmed")).toBe(false);
    expect(canTransition("reversed", "reversed")).toBe(false);
  });
});

describe("canRecordCredit — SPENDLY-77", () => {
  const ALL_STATUSES: EpfContributionStatus[] = [
    "draft",
    "confirmed",
    "expected",
    "credited",
    "partial",
    "missed",
    "reversed",
  ];

  it("matches the sheet rule: both credited and partial must be legal", () => {
    for (const status of ALL_STATUSES) {
      expect(canRecordCredit(status), status).toBe(
        canTransition(status, "credited") && canTransition(status, "partial")
      );
    }
  });

  it("is available for a reversed month, and for every other credit path", () => {
    expect(canRecordCredit("reversed")).toBe(true);
    expect(canRecordCredit("expected")).toBe(true);
    expect(canRecordCredit("confirmed")).toBe(true);
    expect(canRecordCredit("missed")).toBe(true);
    expect(canRecordCredit("credited")).toBe(true);
    expect(canRecordCredit("partial")).toBe(true);
  });

  it("stays closed on a draft — Backfill has to save it first", () => {
    expect(canRecordCredit("draft")).toBe(false);
  });
});

describe("transitionRejectionMessage", () => {
  it("tells a draft what has to happen first, not what the code refused", () => {
    const message = transitionRejectionMessage("draft", "credited");
    expect(message).toContain("Backfill");
    expect(message).not.toContain("draft month to credited");
  });

  it("explains that only a credited month can be reversed", () => {
    expect(transitionRejectionMessage("expected", "reversed")).toBe(
      "Only a credited month can be reversed."
    );
  });

  it("tells a reversed month to record the credit again, not to mark missed", () => {
    expect(transitionRejectionMessage("reversed", "missed")).toBe(
      "This month was reversed. Record the credit again if it came back."
    );
    expect(transitionRejectionMessage("reversed", "expected")).toContain("reversed");
  });

  it("falls back to a readable sentence for anything else", () => {
    expect(transitionRejectionMessage("credited", "draft")).toContain("credited");
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

  it("keeps credited → reversed → credited as three distinct events — SPENDLY-77", () => {
    const row = contribution();
    const credited = buildContributionEvent(row, "expected", "credited", {
      actor: "user",
      amount: 4750,
    });
    const reversed = buildContributionEvent(row, "credited", "reversed", {
      actor: "user",
      reason: "Reversed by EPFO",
    });
    const reccredited = buildContributionEvent(row, "reversed", "credited", {
      actor: "user",
      amount: 4750,
    });
    expect([credited.from, credited.to]).toEqual(["expected", "credited"]);
    expect([reversed.from, reversed.to]).toEqual(["credited", "reversed"]);
    expect([reccredited.from, reccredited.to]).toEqual(["reversed", "credited"]);
    expect(reccredited.amount).toBe(4750);
  });
});

describe("reversed → credited again — SPENDLY-77", () => {
  const at = "2026-09-26T00:00:00.000Z";
  const later = "2026-10-02T00:00:00.000Z";

  function reversedMonth() {
    const credited = applyActualCredit(contribution(), {
      amount: 4750,
      date: "2026-09-20",
      reconciledAt: at,
    });
    return applyReversed(credited, "Reversed by EPFO", at);
  }

  it("records a full re-credit as credited, with the new amount and date", () => {
    const row = applyActualCredit(reversedMonth(), {
      amount: 4750,
      date: "2026-10-01",
      reconciledAt: later,
    });
    expect(row.status).toBe("credited");
    expect(row.creditedAmount).toBe(4750);
    expect(row.creditDate).toBe("2026-10-01");
    expect(row.reconciledAt).toBe(later);
    expect(row.statusReason).toBeUndefined();
    expect(isReconciled(row)).toBe(true);
  });

  it("records a shortfall re-credit as partial without rewriting the projection", () => {
    const row = applyActualCredit(reversedMonth(), {
      amount: 3000,
      date: "2026-10-01",
      reconciledAt: later,
    });
    expect(row.status).toBe("partial");
    expect(row.creditedAmount).toBe(3000);
    expect(row.epfCredit).toBe(4750);
    expect(canTransition("reversed", row.status)).toBe(true);
  });

  it("does not invent an automatic path to credited", () => {
    // SPENDLY-72: nothing in this module writes credited on its own. The
    // user path above is the only way a reversed month moves.
    expect(canTransition("expected", "reversed")).toBe(false);
    expect(canTransition("reversed", "credited")).toBe(true);
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

/**
 * The route SPENDLY-1 reopened.
 *
 * `draft` keeps no legal transitions — a draft is not yet a claim about
 * anything (SPENDLY-72). It escapes through KAN-66's save path, which writes
 * `confirmed` directly, and only then may take a credit. This pins both halves
 * so neither can be removed without the other being reconsidered.
 */
describe("draft escape route — SPENDLY-1", () => {
  const ALL_STATUSES: EpfContributionStatus[] = [
    "draft",
    "confirmed",
    "expected",
    "credited",
    "partial",
    "missed",
    "reversed",
  ];

  it("still refuses every direct transition out of draft", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransition("draft", to), `draft -> ${to}`).toBe(false);
    }
  });

  it("allows a confirmed month to take the credit that landed", () => {
    expect(canTransition("confirmed", "credited")).toBe(true);
    expect(canTransition("confirmed", "partial")).toBe(true);
  });

  it("explains how to get a draft unstuck rather than naming the statuses", () => {
    const message = transitionRejectionMessage("draft", "credited");
    expect(message).toContain("Backfill");
    expect(message).not.toContain("Cannot move");
  });
});
