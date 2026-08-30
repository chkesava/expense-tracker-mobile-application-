import type { PandalMember, PandalRole } from "@/shared/types/ganesh";

type RoleSeedSnapshot = {
  pandalId: string;
  roles: PandalRole[] | null;
  members: PandalMember[] | null;
};

let seed: RoleSeedSnapshot | null = null;

export function rememberGaneshRoleSeed(
  pandalId: string | null,
  roles: PandalRole[] | null,
  members: PandalMember[] | null
): void {
  if (!pandalId) {
    seed = null;
    return;
  }
  seed = { pandalId, roles, members };
}

export function peekGaneshRoleSeed(
  pandalId: string
): { roles: PandalRole[] | null; members: PandalMember[] | null } | null {
  if (!seed || seed.pandalId !== pandalId) {
    return null;
  }
  return { roles: seed.roles, members: seed.members };
}

export function resetGaneshRoleSeedForTests(): void {
  seed = null;
}
