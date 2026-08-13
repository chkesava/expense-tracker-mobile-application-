import { describe, expect, it } from "vitest";

import { searchInstitutions } from "./institutions";
import {
  inferInstitutionFromDisplayName,
  lookupInstitution,
  matchInstitutionFromSender,
  resolveInstitutionFromSms,
} from "./institutionMatch";

describe("searchInstitutions", () => {
  it("ranks Super Money for Super Money / Super Card queries", () => {
    expect(searchInstitutions("Super Money")[0]?.id).toBe("super_money");
    expect(searchInstitutions("super")[0]?.id).toBe("super_money");
    expect(searchInstitutions("Super Card")[0]?.id).toBe("super_money");
  });

  it("finds Super Money from an SMS sender pattern", () => {
    expect(searchInstitutions("VM-SUPER")[0]?.id).toBe("super_money");
  });

  it("returns the catalog A–Z when the query is empty", () => {
    const all = searchInstitutions("");
    expect(all.length).toBeGreaterThan(0);
    expect(all.map((item) => item.name)).toEqual(
      [...all].sort((a, b) => a.name.localeCompare(b.name)).map((item) => item.name)
    );
  });

  it("does not invent an institution from an arbitrary string", () => {
    expect(searchInstitutions("My Custom Bank XYZ")).toEqual([]);
  });
});

describe("lookupInstitution", () => {
  it("maps product names to the canonical institution, not the product label", () => {
    expect(lookupInstitution("Super Card")?.id).toBe("super_money");
    expect(lookupInstitution("Super Money Card")?.id).toBe("super_money");
    expect(lookupInstitution("Super Money Credit Card")?.id).toBe("super_money");
    expect(lookupInstitution("Super")?.id).toBe("super_money");
    expect(lookupInstitution("Super Card")?.name).toBe("Super Money");
  });

  it("does not treat supermarket as Super Money", () => {
    expect(lookupInstitution("supermarket")).toBeUndefined();
    expect(lookupInstitution("super market")).toBeUndefined();
  });

  it("does not use SMS senders as name aliases", () => {
    expect(lookupInstitution("VM-SUPER")).toBeUndefined();
  });
});

describe("inferInstitutionFromDisplayName", () => {
  it("maps Super Money Credit Card to Super Money, not the full label", () => {
    const inferred = inferInstitutionFromDisplayName("Super Money Credit Card");
    expect(inferred?.id).toBe("super_money");
    expect(inferred?.name).toBe("Super Money");
  });
});

describe("matchInstitutionFromSender", () => {
  it("resolves verified Super Money DLT headers", () => {
    expect(matchInstitutionFromSender("VM-SUPER")?.institution.id).toBe(
      "super_money"
    );
    expect(matchInstitutionFromSender("AD-SUPER")?.institution.id).toBe(
      "super_money"
    );
    expect(matchInstitutionFromSender("VM-SUPER")?.source).toBe("sender");
  });

  it("resolves HDFC and SBI from existing SMS fixtures", () => {
    expect(matchInstitutionFromSender("VK-HDFCBK")?.institution.id).toBe("hdfc");
    expect(matchInstitutionFromSender("AX-HDFCBK")?.institution.id).toBe("hdfc");
    expect(matchInstitutionFromSender("VK-SBIINB")?.institution.id).toBe("sbi");
  });

  it("does not match a longer unrelated header that only starts with SUPER", () => {
    expect(matchInstitutionFromSender("VM-SUPERMARKET")).toBeUndefined();
  });
});

describe("resolveInstitutionFromSms", () => {
  it("prefers sender over body product names", () => {
    const match = resolveInstitutionFromSms({
      sender: "VM-SUPER",
      body: "HDFC Bank: INR 100 spent on Super Card",
    });
    expect(match?.institution.id).toBe("super_money");
    expect(match?.source).toBe("sender");
  });

  it("resolves Super Card from the message body when sender is unknown", () => {
    const match = resolveInstitutionFromSms({
      sender: "VM-UNKNOWN",
      body: "INR 200 spent on Super Card ending 4521",
    });
    expect(match?.institution.id).toBe("super_money");
    expect(match?.source).toBe("product");
  });
});
