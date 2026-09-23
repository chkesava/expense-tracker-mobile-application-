import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRelease } from "./appRelease";
import { hashApkBytes } from "./apkUpdateSecurity";

const mocks = vi.hoisted(() => ({
  bytes: new TextEncoder().encode("signed-apk"),
  createDownloadTask: vi.fn(),
  deleteFile: vi.fn(),
  downloadAsync: vi.fn(),
  canRequestPackageInstalls: vi.fn(),
  installApk: vi.fn(),
  openUnknownSourcesSettings: vi.fn(),
  fetchLatestRelease: vi.fn(),
  getInstalledVersionCode: vi.fn(),
  openURL: vi.fn(),
}));

vi.mock("expo-file-system", () => {
  class MockFile {
    uri = "file:///cache/apk-updates/spendly-2.apk";
    exists = true;

    constructor(..._parts: unknown[]) {}

    get size() {
      return mocks.bytes.byteLength;
    }

    readableStream() {
      return new Blob([mocks.bytes]).stream();
    }

    delete() {
      this.exists = false;
      mocks.deleteFile();
    }

    static createDownloadTask(
      _url: string,
      destination: MockFile,
      options: {
        onProgress: (progress: {
          bytesWritten: number;
          totalBytes: number;
        }) => void;
      }
    ) {
      mocks.createDownloadTask(_url, destination, options);
      return {
        downloadAsync: () => mocks.downloadAsync(destination, options),
      };
    }
  }

  return {
    File: MockFile,
    Directory: class {
      constructor(..._parts: unknown[]) {}
      create() {}
    },
    Paths: { cache: "file:///cache" },
  };
});

vi.mock("firebase/storage", () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
}));

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn() },
  Linking: { openURL: mocks.openURL },
  Platform: { OS: "android" },
}));

vi.mock("@/lib/apkInstaller", () => ({
  default: {
    canRequestPackageInstalls: mocks.canRequestPackageInstalls,
    installApk: mocks.installApk,
    openUnknownSourcesSettings: mocks.openUnknownSourcesSettings,
  },
}));

vi.mock("@/lib/activeProduct", () => ({
  productAppName: () => "Spendly",
}));

vi.mock("@/lib/errors", () => ({
  logWarning: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirebaseStorage: () => null,
}));

vi.mock("@/hooks/useAppUpdate", () => ({
  fetchLatestRelease: mocks.fetchLatestRelease,
  getInstalledVersionCode: mocks.getInstalledVersionCode,
}));

import {
  hasTrustedAppReleaseFallback,
  installAppRelease,
  openAppReleaseFallback,
  type InstallProgress,
} from "./apkUpdate";

function release(overrides: Partial<AppRelease> = {}): AppRelease {
  return {
    versionName: "2.0.13",
    versionCode: 98,
    downloadUrl:
      "https://github.com/chkesava/expense-tracker-mobile-application-/releases/download/v2.0.13/Spendly.apk",
    notes: "",
    mandatory: false,
    contentLength: mocks.bytes.byteLength,
    sha256: hashApkBytes(mocks.bytes),
    ...overrides,
  };
}

describe("installAppRelease", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.fetchLatestRelease.mockResolvedValue(null);
    mocks.getInstalledVersionCode.mockReturnValue(97);
    mocks.canRequestPackageInstalls.mockResolvedValue(true);
    mocks.installApk.mockResolvedValue("pending");
    mocks.downloadAsync.mockImplementation(
      async (
        file: unknown,
        options: {
          onProgress: (progress: {
            bytesWritten: number;
            totalBytes: number;
          }) => void;
        }
      ) => {
        options.onProgress({ bytesWritten: 5, totalBytes: 10 });
        options.onProgress({ bytesWritten: 10, totalBytes: 10 });
        return file;
      }
    );
  });

  it("shows finalizing at byte-level 100% before verification begins", async () => {
    let finishDownload: ((file: unknown) => void) | undefined;
    mocks.downloadAsync.mockImplementation(
      (
        file: unknown,
        options: {
          onProgress: (progress: {
            bytesWritten: number;
            totalBytes: number;
          }) => void;
        }
      ) => {
        options.onProgress({ bytesWritten: 10, totalBytes: 10 });
        return new Promise((resolve) => {
          finishDownload = () => resolve(file);
        });
      }
    );

    const phases: InstallProgress[] = [];
    const installing = installAppRelease(release(), (progress) => {
      phases.push(progress);
    });

    await vi.waitFor(() => {
      expect(phases.at(-1)).toEqual({ phase: "finalizing" });
    });
    expect(phases.some((progress) => progress.phase === "verifying")).toBe(false);

    finishDownload?.({});
    await expect(installing).resolves.toBe("installer-started");
    expect(phases.map((progress) => progress.phase)).toEqual([
      "resolving",
      "downloading",
      "finalizing",
      "verifying",
      "starting-installer",
      "waiting",
    ]);
  });

  it("rejects a checksum mismatch before PackageInstaller is called", async () => {
    const installing = installAppRelease(release({ sha256: "a".repeat(64) }));

    await expect(installing).rejects.toMatchObject({
      code: "integrity",
    });
    expect(mocks.installApk).not.toHaveBeenCalled();
    expect(mocks.deleteFile).toHaveBeenCalled();
  });

  it("turns a stalled transfer into an actionable timeout", async () => {
    vi.useFakeTimers();
    mocks.downloadAsync.mockImplementation(
      (
        _file: unknown,
        options: { signal: AbortSignal }
      ) =>
        new Promise((_, reject) => {
          options.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        })
    );

    const installing = installAppRelease(release());
    const result = expect(installing).rejects.toMatchObject({
      code: "download-timeout",
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_001);

    await result;
    expect(mocks.installApk).not.toHaveBeenCalled();
  });
});

describe("trusted release fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens an approved GitHub release APK", async () => {
    const target = release();

    expect(hasTrustedAppReleaseFallback(target)).toBe(true);
    await openAppReleaseFallback(target);

    expect(mocks.openURL).toHaveBeenCalledWith(target.downloadUrl);
  });

  it("rejects a release without an approved fallback URL", async () => {
    const target = release({
      downloadUrl: "https://example.com/Spendly.apk",
      testerUrl: undefined,
    });

    expect(hasTrustedAppReleaseFallback(target)).toBe(false);
    await expect(openAppReleaseFallback(target)).rejects.toThrow(
      /No trusted download page/
    );
    expect(mocks.openURL).not.toHaveBeenCalled();
  });
});
