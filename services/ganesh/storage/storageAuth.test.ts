import { describe, expect, it } from "vitest";

import { assertCanUpload, assertCanUploadPandalAsset, assertCanUploadPandalSponsor } from "./storageAuth";

const memberUpload = {
  uid: "user-1",
  role: "member" as const,
  memberStatus: "active",
  sessionPandalId: "pandal-a",
  sessionFestivalId: "fest-2026",
  pandalId: "pandal-a",
  festivalId: "fest-2026",
  category: "expenses" as const,
  festivalBelongsToPandal: true,
};

describe("assertCanUpload", () => {
  it("lets an active member upload an expense receipt", () => {
    expect(() => assertCanUpload(memberUpload)).not.toThrow();
  });

  it("lets an active member upload a contribution photo", () => {
    expect(() => assertCanUpload({ ...memberUpload, category: "contributions" })).not.toThrow();
  });

  it("denies a viewer", () => {
    expect(() => assertCanUpload({ ...memberUpload, role: "viewer" })).toThrow(
      "You do not have permission to upload this file."
    );
  });

  it("denies a collector for receipts and photos", () => {
    expect(() => assertCanUpload({ ...memberUpload, role: "collector" })).toThrow(
      "You do not have permission to upload this file."
    );
    expect(() =>
      assertCanUpload({ ...memberUpload, role: "collector", category: "contributions" })
    ).toThrow("You do not have permission to upload this file.");
  });

  it("denies a suspended member", () => {
    expect(() => assertCanUpload({ ...memberUpload, memberStatus: "suspended" })).toThrow(
      "You do not have access to this Pandal."
    );
  });

  it("denies a different Pandal than the session", () => {
    expect(() => assertCanUpload({ ...memberUpload, pandalId: "pandal-b" })).toThrow(
      "You cannot store files in another Pandal."
    );
  });

  it("denies a festival that is not the session festival", () => {
    expect(() => assertCanUpload({ ...memberUpload, festivalId: "fest-2027" })).toThrow(
      "You cannot store files in another festival."
    );
  });

  it("denies a festival that does not belong to the session Pandal", () => {
    expect(() => assertCanUpload({ ...memberUpload, festivalBelongsToPandal: false })).toThrow(
      "You cannot store files in another festival."
    );
  });

  it("lets a member upload an asset photo without a festival", () => {
    expect(() =>
      assertCanUploadPandalAsset({
        uid: "user-1",
        role: "member",
        memberStatus: "active",
        sessionPandalId: "pandal-a",
        pandalId: "pandal-a",
      })
    ).not.toThrow();
  });

  it("lets a member upload a sponsor photo without a festival", () => {
    expect(() =>
      assertCanUploadPandalSponsor({
        uid: "user-1",
        role: "member",
        memberStatus: "active",
        sessionPandalId: "pandal-a",
        pandalId: "pandal-a",
      })
    ).not.toThrow();
  });

  it("denies a viewer uploading a sponsor photo", () => {
    expect(() =>
      assertCanUploadPandalSponsor({
        uid: "user-1",
        role: "viewer",
        memberStatus: "active",
        sessionPandalId: "pandal-a",
        pandalId: "pandal-a",
      })
    ).toThrow("You do not have permission to upload this file.");
  });

  it("denies a viewer uploading an asset photo", () => {
    expect(() =>
      assertCanUploadPandalAsset({
        uid: "user-1",
        role: "viewer",
        memberStatus: "active",
        sessionPandalId: "pandal-a",
        pandalId: "pandal-a",
      })
    ).toThrow("You do not have permission to upload this file.");
  });
});
