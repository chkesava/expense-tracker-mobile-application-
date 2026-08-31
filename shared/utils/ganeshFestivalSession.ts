export function pickFestivalFromList<T extends { id: string; status?: string }>(
  festivals: T[]
): T | undefined {
  return festivals.find((festival) => festival.status === "open") ?? festivals[0];
}

/**
 * Session `festivalId` must point at a festival that still exists on this
 * Pandal. An empty loaded list is treated as "keep" so a just-created festival
 * is not cleared before its first snapshot arrives.
 */
export function resolveSessionFestival(
  festivalId: string | null | undefined,
  festivals: Array<{ id: string; status?: string }>,
  loaded: boolean
): { action: "keep" } | { action: "switch"; festivalId: string } | { action: "clear" } {
  if (!loaded) return { action: "keep" };
  if (festivals.length === 0) return { action: "keep" };
  if (festivalId && festivals.some((festival) => festival.id === festivalId)) {
    return { action: "keep" };
  }
  const next = pickFestivalFromList(festivals);
  if (!next) return { action: "clear" };
  return { action: "switch", festivalId: next.id };
}
