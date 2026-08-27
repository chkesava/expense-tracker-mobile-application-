import { describe, expect, it } from "vitest";

import { buildsBehind, isTesterWebpageUrl, parseRelease, releaseDocPath } from "./appRelease";

describe("parseRelease", () => {
  it("parses a Storage-backed release", () => {
    const release = parseRelease({
      versionName: "2.1.1",
      versionCode: 41,
      downloadUrl: "https://firebasestorage.googleapis.com/v0/b/app/o/x.apk?alt=media",
      storagePath: "releases/41/Spendly-2.1.1-41.apk",
      testerUrl: "https://appdistribution.firebase.dev/i/abc",
      notes: "In-app updates",
      mandatory: false,
      contentLength: 50000000,
    });

    expect(release).toMatchObject({
      versionName: "2.1.1",
      versionCode: 41,
      storagePath: "releases/41/Spendly-2.1.1-41.apk",
      testerUrl: "https://appdistribution.firebase.dev/i/abc",
      notes: "In-app updates",
      contentLength: 50000000,
    });
  });

  it("accepts storagePath without downloadUrl", () => {
    const release = parseRelease({
      versionCode: 41,
      storagePath: "releases/41/app.apk",
    });
    expect(release?.versionCode).toBe(41);
    expect(release?.storagePath).toBe("releases/41/app.apk");
    expect(release?.downloadUrl).toBe("");
  });

  it("rejects a doc with no APK pointer", () => {
    expect(parseRelease({ versionCode: 41, notes: "hi" })).toBeNull();
  });

  it("rejects a non-integer versionCode", () => {
    expect(
      parseRelease({ versionCode: "nope", downloadUrl: "https://example.com/a.apk" })
    ).toBeNull();
  });

  it("leaves product/applicationId undefined on a pre-split doc", () => {
    const release = parseRelease({
      versionCode: 41,
      downloadUrl: "https://example.com/a.apk",
    });
    expect(release?.product).toBeUndefined();
    expect(release?.applicationId).toBeUndefined();
  });

  it("parses product and applicationId when present", () => {
    const release = parseRelease({
      versionCode: 41,
      downloadUrl: "https://example.com/a.apk",
      product: "ganesh",
      applicationId: "com.example.ganeshseva",
    });
    expect(release?.product).toBe("ganesh");
    expect(release?.applicationId).toBe("com.example.ganeshseva");
  });

  it("ignores an unrecognized product value", () => {
    const release = parseRelease({
      versionCode: 41,
      downloadUrl: "https://example.com/a.apk",
      product: "bogus",
    });
    expect(release?.product).toBeUndefined();
  });
});

describe("releaseDocPath", () => {
  it("keeps the legacy combined path when no product is given", () => {
    expect(releaseDocPath(null)).toEqual(["system_settings", "latest_release"]);
  });

  it("scopes the doc path per product", () => {
    expect(releaseDocPath("expense")).toEqual(["system_settings", "latest_release_expense"]);
    expect(releaseDocPath("nutrition")).toEqual([
      "system_settings",
      "latest_release_nutrition",
    ]);
    expect(releaseDocPath("ganesh")).toEqual(["system_settings", "latest_release_ganesh"]);
  });
});

describe("isTesterWebpageUrl", () => {
  it("detects App Distribution and console links", () => {
    expect(isTesterWebpageUrl("https://appdistribution.firebase.dev/i/abc")).toBe(true);
    expect(
      isTesterWebpageUrl("https://console.firebase.google.com/project/x/appdistribution")
    ).toBe(true);
    expect(
      isTesterWebpageUrl("https://firebasestorage.googleapis.com/v0/b/app/o/x.apk")
    ).toBe(false);
    expect(
      isTesterWebpageUrl(
        "https://github.com/chkesava/expense-tracker-mobile-application-/releases/download/android-v2.2.1-42/Spendly-2.2.1-42.apk"
      )
    ).toBe(false);
  });
});

describe("buildsBehind", () => {
  it("returns 0 when current or ahead", () => {
    expect(buildsBehind(40, 40)).toBe(0);
    expect(buildsBehind(41, 40)).toBe(0);
    expect(buildsBehind(null, 40)).toBe(0);
  });

  it("counts skipped builds so 2.1.0 can jump to latest", () => {
    expect(buildsBehind(40, 41)).toBe(1);
    expect(buildsBehind(40, 45)).toBe(5);
  });
});
