import type { GaneshFileMeta, GaneshRole } from "@/shared/types/ganesh";
import type { GaneshPermission } from "@/shared/utils/ganeshPermissions";

export type { GaneshFileMeta };

export const GANESH_FILES_BUCKET = "ganesh-files";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export type GaneshFestivalStorageCategory = "expenses" | "contributions" | "documents";
export type GaneshStorageCategory = GaneshFestivalStorageCategory | "assets" | "sponsors";

export type PreparedGaneshImage = {
  uri: string;
  mimeType: AllowedImageType;
  fileName: string;
  size: number;
  /**
   * The file's bytes, when `prepareGaneshImage` already had to read them
   * (GS-097). `uploadObject` reuses these instead of fetching the URI again.
   * Optional because a picked image whose size the picker reported, and which
   * needs no compression, is never read before upload - and must not be, just
   * to populate this.
   */
  bytes?: ArrayBuffer;
};

export type UploadFestivalFileInput = {
  uid: string;
  role: GaneshRole | undefined;
  permissions?: GaneshPermission[];
  memberStatus: string | undefined;
  sessionPandalId: string | null;
  sessionFestivalId: string | null;
  pandalId: string;
  festivalId: string;
  recordId: string;
  category: GaneshFestivalStorageCategory;
  festivalBelongsToPandal: boolean;
  file: PreparedGaneshImage;
};

export type UploadPandalAssetFileInput = {
  uid: string;
  role: GaneshRole | undefined;
  permissions?: GaneshPermission[];
  memberStatus: string | undefined;
  sessionPandalId: string | null;
  pandalId: string;
  assetId: string;
  file: PreparedGaneshImage;
};

export type UploadPandalSponsorFileInput = {
  uid: string;
  role: GaneshRole | undefined;
  permissions?: GaneshPermission[];
  memberStatus: string | undefined;
  sessionPandalId: string | null;
  pandalId: string;
  sponsorId: string;
  file: PreparedGaneshImage;
};

export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const TARGET_MAX_BYTES = Math.round(1.5 * 1024 * 1024);
export const RECEIPT_MAX_EDGE = 1600;
