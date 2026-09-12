import { describe, expect, it } from "vitest";

import { normalizeEpfProfile, normalizeEstablishment } from "@/shared/features/epf/utils";
import { normalizeEpfContribution } from "@/shared/features/epf/utils/contributions";
import { normalizeTransfer } from "@/shared/features/epf/utils/transfers";
import { normalizeInterestEntry } from "@/shared/features/epf/utils/interest";
import { normalizeReconciliation } from "@/shared/features/epf/utils/reconciliation";

/**
 * The migration evidence for KAN-73.
 *
 * No EPF collection needs a data migration, and the reason is not "the fields
 * never changed" — several were added after KAN-65, and the user has live data
 * written by v0.3.8 before `archived`, `epsMember` and `reconciledAt` existed.
 * The reason is that every read goes through a normalizer that treats an absent
 * field as absent rather than asserting it is present.
 *
 * That claim is only worth anything if it is tested, so these pin it: every
 * normalizer against an empty document, against a v0.3.8-shaped document, and
 * against a document from a hypothetical future build with unknown extra
 * fields.
 */

const normalizers = [
  ["profile", normalizeEpfProfile],
  ["establishment", normalizeEstablishment],
  ["contribution", normalizeEpfContribution],
  ["transfer", normalizeTransfer],
  ["interest entry", normalizeInterestEntry],
  ["reconciliation", normalizeReconciliation],
] as const;

describe("tolerant reads — the migration guarantee", () => {
  describe.each(normalizers)("%s", (_name, normalize) => {
    it("survives a completely empty document", () => {
      expect(() => normalize("doc-1", {})).not.toThrow();
    });

    it("always carries the document id through", () => {
      expect(normalize("doc-1", {}).id).toBe("doc-1");
    });

    it("never returns undefined for the object itself", () => {
      expect(normalize("doc-1", {})).toBeTypeOf("object");
    });

    it("ignores unknown fields from a newer build rather than failing", () => {
      const result = normalize("doc-1", {
        someFutureField: "hello",
        anotherOne: { nested: true },
      });
      expect(result.id).toBe("doc-1");
      expect("someFutureField" in result).toBe(false);
    });

    it("does not crash on wrongly-typed values", () => {
      // Not a hypothetical: a hand-edited console document, or a field written
      // by a build that stored a different shape.
      expect(() =>
        normalize("doc-1", { employerName: 42, amount: "not a number", archived: "yes" })
      ).not.toThrow();
    });
  });
});

describe("v0.3.8-shaped documents — written before later fields existed", () => {
  it("reads a KAN-65 establishment that predates `archived`", () => {
    const result = normalizeEstablishment("est-1", {
      profileId: "main",
      employerName: "Acme",
      establishmentNumber: "MH/12345",
      memberId: "MH/12345/001",
      dateJoined: "2020-04-01",
      // no `archived`, no `notes` — these came later
    });

    expect(result.archived).toBeUndefined();
    expect(result.employerName).toBe("Acme");
    // Still current, because dateLeft is absent — not because archived is.
    expect(result.dateLeft).toBeUndefined();
    expect(result.employmentStatus).toBe("current");
  });

  it("reads a KAN-66 contribution that predates `reconciledAt`", () => {
    const result = normalizeEpfContribution("2020-04", {
      establishmentId: "est-1",
      month: "2020-04",
      wage: 15000,
      employeeShare: 1800,
      employerShare: 1800,
      // no `reconciledAt` — KAN-70 added it
    });

    expect(result.reconciledAt).toBeUndefined();
    expect(result.month).toBe("2020-04");
  });

  it("treats an absent `archived` as not archived, not as unknown", () => {
    // The delete guard and the employment-state derivation both branch on this.
    expect(normalizeEstablishment("est-1", {}).archived).toBeUndefined();
    expect(normalizeEstablishment("est-1", { archived: false }).archived).toBeUndefined();
    expect(normalizeEstablishment("est-1", { archived: true }).archived).toBe(true);
  });
});

describe("normalizeEpfProfile", () => {
  it("reads a full profile", () => {
    const result = normalizeEpfProfile("main", {
      employeeName: "A. Person",
      uan: "123456789012",
      activeEstablishmentId: "est-1",
      notes: "primary",
    });

    expect(result).toMatchObject({
      id: "main",
      employeeName: "A. Person",
      uan: "123456789012",
      activeEstablishmentId: "est-1",
      notes: "primary",
    });
  });

  it("collapses an absent, empty or cleared pointer to null", () => {
    // Absent and "explicitly cleared" mean the same thing for a lock hint.
    expect(normalizeEpfProfile("main", {}).activeEstablishmentId).toBeNull();
    expect(normalizeEpfProfile("main", { activeEstablishmentId: "" }).activeEstablishmentId).toBeNull();
    expect(
      normalizeEpfProfile("main", { activeEstablishmentId: null }).activeEstablishmentId
    ).toBeNull();
  });

  it("defaults the identity fields to empty strings, never undefined", () => {
    // These render directly; undefined would print as "undefined".
    const result = normalizeEpfProfile("main", {});
    expect(result.employeeName).toBe("");
    expect(result.uan).toBe("");
  });

  it("drops an empty notes string rather than storing it", () => {
    expect(normalizeEpfProfile("main", { notes: "" }).notes).toBeUndefined();
  });
});
