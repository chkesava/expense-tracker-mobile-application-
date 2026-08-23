import type { GaneshStorageCategory } from "@/services/ganesh/storage/storageTypes";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_FILE = /^[A-Za-z0-9._-]{1,80}$/;
const CATEGORIES: GaneshStorageCategory[] = ["expenses", "contributions", "documents"];

export function assertSafeId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_SEGMENT.test(trimmed)) {
    throw new Error(`Invalid ${label}.`);
  }
  return trimmed;
}

export function sanitizeFileName(fileName: string, fallback: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || fallback;
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!SAFE_FILE.test(cleaned)) return fallback;
  return cleaned;
}

export function buildFestivalFilePath(input: {
  pandalId: string;
  festivalId: string;
  category: GaneshStorageCategory;
  recordId: string;
  fileName: string;
}): string {
  const pandalId = assertSafeId(input.pandalId, "Pandal");
  const festivalId = assertSafeId(input.festivalId, "festival");
  const recordId = assertSafeId(input.recordId, "record");
  if (!CATEGORIES.includes(input.category)) {
    throw new Error("Invalid file category.");
  }
  const fileName = sanitizeFileName(input.fileName, `${input.category}.jpg`);
  return `pandals/${pandalId}/festivals/${festivalId}/${input.category}/${recordId}/${fileName}`;
}

export function assertOwnedFestivalPath(
  path: string,
  expected: { pandalId: string; festivalId: string }
): void {
  const pandalId = assertSafeId(expected.pandalId, "Pandal");
  const festivalId = assertSafeId(expected.festivalId, "festival");
  const prefix = `pandals/${pandalId}/festivals/${festivalId}/`;
  if (path.includes("..") || path.startsWith("/") || !path.startsWith(prefix)) {
    throw new Error("That file does not belong to this festival.");
  }
  const built = path.split("/");
  if (built.length !== 7 || !CATEGORIES.includes(built[4] as GaneshStorageCategory)) {
    throw new Error("Invalid storage path.");
  }
}

export function ganeshStoredPath(
  meta?: { path?: string } | null,
  legacy?: string | null
): string | undefined {
  if (meta?.path && !meta.path.startsWith("http")) return meta.path;
  if (legacy && !legacy.startsWith("http")) return legacy;
  return undefined;
}
