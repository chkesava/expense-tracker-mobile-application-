export const GANESH_SESSION_LEGACY_KEY = "@ganesh_session";

export type GaneshSessionState = {
  pandalId: string | null;
  festivalId: string | null;
};

export function ganeshSessionStorageKey(uid: string): string {
  return `@ganesh_session:${uid}`;
}

export function emptyGaneshSession(): GaneshSessionState {
  return { pandalId: null, festivalId: null };
}

export function parseGaneshSession(raw: string | null): GaneshSessionState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { pandalId?: string | null; festivalId?: string | null };
    return {
      pandalId: parsed.pandalId ?? null,
      festivalId: parsed.festivalId ?? null,
    };
  } catch {
    return null;
  }
}

export function hasGaneshSession(session: GaneshSessionState | null): boolean {
  return Boolean(session?.pandalId || session?.festivalId);
}
