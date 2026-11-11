import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

vi.mock("expo-file-system", () => ({
  Directory: class {
    constructor(..._parts: unknown[]) {}
    create() {}
  },
  File: class {
    uri = "file:///cache/document-previews/test.pdf";
    exists = true;
    constructor(..._parts: unknown[]) {}
    delete() {}
    static createDownloadTask() {
      return {
        downloadAsync: () =>
          Promise.resolve({ uri: "file:///cache/document-previews/test.pdf", exists: true }),
      };
    }
  },
  Paths: { cache: "file:///cache" },
}));

vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
  shareAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/accounts/spendlyFilesClient", () => ({
  createDocumentSignedUrl: vi.fn(async (path: string) => {
    if (path.includes("forbidden")) {
      throw new Error("403 permission denied");
    }
    if (path.includes("missing")) {
      throw new Error("404 bucket object not found");
    }
    return `https://supabase.example.com/storage/v1/object/sign/${path}?token=signed-123`;
  }),
}));

import {
  resolveDocumentKind,
  resolveDocumentUrl,
  viewerFriendlyError,
  downloadDocumentToCache,
} from "./documentViewerHelpers";

describe("documentViewerHelpers", () => {
  describe("resolveDocumentKind", () => {
    it("classifies image MIME types", () => {
      expect(resolveDocumentKind("image/jpeg")).toBe("image");
      expect(resolveDocumentKind("image/png")).toBe("image");
      expect(resolveDocumentKind("image/webp")).toBe("image");
      expect(resolveDocumentKind("IMAGE/JPEG")).toBe("image");
    });

    it("classifies PDF MIME types", () => {
      expect(resolveDocumentKind("application/pdf")).toBe("pdf");
      expect(resolveDocumentKind("APPLICATION/PDF")).toBe("pdf");
    });

    it("classifies unsupported MIME types", () => {
      expect(resolveDocumentKind("application/zip")).toBe("unsupported");
      expect(resolveDocumentKind("text/plain")).toBe("unsupported");
      expect(resolveDocumentKind("")).toBe("unsupported");
      expect(resolveDocumentKind(undefined)).toBe("unsupported");
    });
  });

  describe("resolveDocumentUrl", () => {
    it("returns pre-existing uri directly without fetching signed URL", async () => {
      const url = await resolveDocumentUrl({
        name: "Test.pdf",
        mimeType: "application/pdf",
        uri: "file:///local/path.pdf",
      });
      expect(url).toBe("file:///local/path.pdf");
    });

    it("resolves storagePath through createDocumentSignedUrl", async () => {
      const url = await resolveDocumentUrl({
        name: "Statement.pdf",
        mimeType: "application/pdf",
        storagePath: "users/u1/accounts/a1/d1/Statement.pdf",
      });
      expect(url).toContain("users/u1/accounts/a1/d1/Statement.pdf?token=signed-123");
    });

    it("throws if neither uri nor storagePath is provided", async () => {
      await expect(
        resolveDocumentUrl({
          name: "Unknown",
          mimeType: "application/pdf",
        })
      ).rejects.toThrow("No document path or location available.");
    });
  });

  describe("viewerFriendlyError", () => {
    it("sanitizes network errors", () => {
      expect(viewerFriendlyError(new Error("Network request failed"))).toMatch(
        /No internet connection/
      );
      expect(viewerFriendlyError("Failed to fetch")).toMatch(/No internet connection/);
    });

    it("sanitizes session / auth errors", () => {
      expect(viewerFriendlyError(new Error("401 unauthorized"))).toMatch(/Session expired/);
      expect(viewerFriendlyError("403 permission denied")).toMatch(/permission/);
    });

    it("handles password / encryption errors", () => {
      expect(viewerFriendlyError(new Error("Password required or encrypted"))).toMatch(
        /password-protected/
      );
    });

    it("sanitizes corrupt or generic errors without exposing internal storage URLs", () => {
      const errorMsg = viewerFriendlyError(
        new Error("Error at https://spmsgncjbnbkxvsbpqlu.supabase.co/storage/v1/object/sign/users/123/doc.pdf")
      );
      expect(errorMsg).not.toContain("supabase.co");
      expect(errorMsg).not.toContain("spmsgncjbnbkxvsbpqlu");
      expect(errorMsg).toContain("Could not load this document");
    });
  });

  describe("downloadDocumentToCache", () => {
    it("downloads document into cache directory", async () => {
      const uri = await downloadDocumentToCache(
        "https://supabase.example.com/file.pdf",
        "statement.pdf"
      );
      expect(uri).toBe("file:///cache/document-previews/test.pdf");
    });
  });
});
