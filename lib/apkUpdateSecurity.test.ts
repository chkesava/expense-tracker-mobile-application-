import { describe, expect, it } from "vitest";

import {
  assertApkIntegrity,
  GITHUB_APK_RELEASE_REPO,
  hashApkBytes,
  isAllowedApkDownloadUrl,
  isMandatoryRelease,
  normalizeSha256,
} from "./apkUpdateSecurity";

const BUCKET = "expenseapp-27f94.appspot.com";
const GITHUB_APK = `https://github.com/${GITHUB_APK_RELEASE_REPO}/releases/download/expense-v4.3.0-50/ExpenseTracker-4.3.0-50.apk`;
const STORAGE_APK = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/releases%2F50%2FExpenseTracker-4.3.0-50.apk?alt=media&token=abc`;

describe("normalizeSha256", () => {
  it("accepts 64-char hex and lowercases it", () => {
    expect(
      normalizeSha256("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD")
    ).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("rejects missing, short, or non-hex values", () => {
    expect(normalizeSha256(undefined)).toBeNull();
    expect(normalizeSha256("")).toBeNull();
    expect(normalizeSha256("  ")).toBeNull();
    expect(normalizeSha256("deadbeef")).toBeNull();
    expect(normalizeSha256("g".repeat(64))).toBeNull();
  });
});

describe("isAllowedApkDownloadUrl", () => {
  it("allows GitHub Release APKs for this repo", () => {
    expect(isAllowedApkDownloadUrl(GITHUB_APK, BUCKET)).toBe(true);
  });

  it("allows Firebase Storage objects in the configured bucket", () => {
    expect(isAllowedApkDownloadUrl(STORAGE_APK, BUCKET)).toBe(true);
  });

  it("rejects http, other hosts, GitHub tree/blob URLs, and tester pages", () => {
    expect(
      isAllowedApkDownloadUrl(GITHUB_APK.replace("https://", "http://"), BUCKET)
    ).toBe(false);
    expect(isAllowedApkDownloadUrl("https://evil.example/Spendly.apk", BUCKET)).toBe(
      false
    );
    expect(
      isAllowedApkDownloadUrl(
        `https://github.com/${GITHUB_APK_RELEASE_REPO}/blob/main/Spendly.apk`,
        BUCKET
      )
    ).toBe(false);
    expect(
      isAllowedApkDownloadUrl("https://appdistribution.firebase.dev/i/abc", BUCKET)
    ).toBe(false);
    expect(
      isAllowedApkDownloadUrl(
        "https://console.firebase.google.com/project/x/appdistribution",
        BUCKET
      )
    ).toBe(false);
  });

  it("rejects GitHub APKs from another repo", () => {
    expect(
      isAllowedApkDownloadUrl(
        "https://github.com/other/repo/releases/download/v1/app.apk",
        BUCKET
      )
    ).toBe(false);
  });

  it("rejects Storage URLs whose bucket does not match, and when the bucket is unknown", () => {
    expect(
      isAllowedApkDownloadUrl(
        "https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/x.apk?alt=media",
        BUCKET
      )
    ).toBe(false);
    expect(isAllowedApkDownloadUrl(STORAGE_APK, "")).toBe(false);
  });

  it("does not treat githubusercontent as a starting URL", () => {
    expect(
      isAllowedApkDownloadUrl(
        "https://objects.githubusercontent.com/github-production-release-asset-2e65be/Spendly.apk",
        BUCKET
      )
    ).toBe(false);
  });
});

describe("assertApkIntegrity", () => {
  const bytes = new TextEncoder().encode("spendly-apk");
  const digest = hashApkBytes(bytes);

  it("accepts a matching hash and size", () => {
    expect(() =>
      assertApkIntegrity(
        { size: bytes.byteLength, sha256: digest.toUpperCase() },
        { sha256: digest, contentLength: bytes.byteLength }
      )
    ).not.toThrow();
  });

  it("fails closed when the published checksum is missing", () => {
    expect(() =>
      assertApkIntegrity({ size: 10, sha256: digest }, { contentLength: 10 })
    ).toThrow(/checksum/);
  });

  it("fails when contentLength is present and does not match", () => {
    expect(() =>
      assertApkIntegrity(
        { size: bytes.byteLength, sha256: digest },
        { sha256: digest, contentLength: bytes.byteLength + 1 }
      )
    ).toThrow(/wrong size/);
  });

  it("fails when the hash does not match", () => {
    expect(() =>
      assertApkIntegrity(
        { size: bytes.byteLength, sha256: "a".repeat(64) },
        { sha256: digest }
      )
    ).toThrow(/did not match/);
  });
});

describe("isMandatoryRelease", () => {
  it("requires both the flag and a valid sha256", () => {
    expect(isMandatoryRelease({ mandatory: true, sha256: "a".repeat(64) })).toBe(
      true
    );
    expect(isMandatoryRelease({ mandatory: true })).toBe(false);
    expect(isMandatoryRelease({ mandatory: true, sha256: "" })).toBe(false);
    expect(
      isMandatoryRelease({ mandatory: false, sha256: "a".repeat(64) })
    ).toBe(false);
  });
});
