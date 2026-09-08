export function duplicateFestivalYearMessage(year: number): string {
  return `A festival for ${year} already exists.`;
}

export function immutableFestivalYearMessage(year: number): string {
  return `The festival year is ${year} and cannot be changed. Create a new festival for a different year.`;
}

/** Year is the uniqueness key (`festivalYears/{year}`). It cannot move after create. */
export function assertFestivalYearUnchanged(
  storedYear: number,
  requestedYear: number | undefined
): void {
  if (requestedYear === undefined) return;
  if (Number(requestedYear) !== Number(storedYear)) {
    throw new Error(immutableFestivalYearMessage(storedYear));
  }
}

export function yearTakenByAnotherFestival(
  festivals: Array<{ id: string; year: number }>,
  year: number,
  exceptFestivalId?: string
): boolean {
  return festivals.some((festival) => festival.year === year && festival.id !== exceptFestivalId);
}

/**
 * Firestore transactions cannot query a collection, so year uniqueness is a
 * sentinel doc at `festivalYears/{year}`. This helper is the claim decision
 * that the create transaction applies after those two document reads.
 */
export function planFestivalYearClaim(input: {
  year: number;
  claimingFestivalId: string;
  sentinel?: { festivalId?: string } | null;
  festivalExists: boolean;
}):
  | { ok: true; writeFestival: boolean; writeSentinel: boolean }
  | { ok: false; error: string } {
  const claimed = String(input.sentinel?.festivalId ?? "");
  if (claimed.length > 0 && claimed !== input.claimingFestivalId) {
    return { ok: false, error: duplicateFestivalYearMessage(input.year) };
  }
  return {
    ok: true,
    writeFestival: !input.festivalExists,
    writeSentinel: claimed.length === 0,
  };
}
