import type { GaneshFestivalStorageCategory } from "@/services/ganesh/storage/storageTypes";
import type { GaneshRole } from "@/shared/types/ganesh";
import { hasPermission } from "@/shared/utils/ganeshPermissionRegistry";
import { can, isGaneshAdmin, type GaneshPermission } from "@/shared/utils/ganeshPermissions";

const CATEGORY_PERMISSIONS: Record<GaneshFestivalStorageCategory, GaneshPermission[]> = {
  expenses: ["expenses.create", "expenses.update"],
  contributions: ["contributions.create", "contributions.update"],
  documents: ["festival.update"],
};

export function uploadPermissionFor(category: GaneshFestivalStorageCategory): GaneshPermission[] {
  return CATEGORY_PERMISSIONS[category];
}

export function assertCanUpload(input: {
  uid: string | null | undefined;
  role: GaneshRole | undefined;
  permissions?: GaneshPermission[];
  memberStatus: string | undefined;
  sessionPandalId: string | null;
  sessionFestivalId: string | null;
  pandalId: string;
  festivalId: string;
  category: GaneshFestivalStorageCategory;
  festivalBelongsToPandal: boolean;
}): void {
  if (!input.uid) throw new Error("You must be signed in.");
  if (input.memberStatus !== "active" && input.memberStatus != null) {
    throw new Error("You do not have access to this Pandal.");
  }
  if (!input.sessionPandalId || !input.sessionFestivalId) {
    throw new Error("Select a Pandal and festival first.");
  }
  if (input.pandalId !== input.sessionPandalId) {
    throw new Error("You cannot store files in another Pandal.");
  }
  if (input.festivalId !== input.sessionFestivalId || !input.festivalBelongsToPandal) {
    throw new Error("You cannot store files in another festival.");
  }
  const allowed = uploadPermissionFor(input.category).some((permission) =>
    isGaneshAdmin(input.role)
    || hasPermission(input.permissions, permission)
    || can(input.role, permission)
  );
  if (!allowed) {
    throw new Error("You do not have permission to upload this file.");
  }
}

export function assertCanUploadPandalAsset(input: {
  uid: string | null | undefined;
  role: GaneshRole | undefined;
  permissions?: GaneshPermission[];
  memberStatus: string | undefined;
  sessionPandalId: string | null;
  pandalId: string;
}): void {
  if (!input.uid) throw new Error("You must be signed in.");
  if (input.memberStatus !== "active" && input.memberStatus != null) {
    throw new Error("You do not have access to this Pandal.");
  }
  if (!input.sessionPandalId) {
    throw new Error("Select a Pandal first.");
  }
  if (input.pandalId !== input.sessionPandalId) {
    throw new Error("You cannot store files in another Pandal.");
  }
  const allowed = (["assets.create", "assets.update"] as GaneshPermission[]).some((permission) =>
    isGaneshAdmin(input.role)
    || hasPermission(input.permissions, permission)
    || can(input.role, permission)
  );
  if (!allowed) {
    throw new Error("You do not have permission to upload this file.");
  }
}
