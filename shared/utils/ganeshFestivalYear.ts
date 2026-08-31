export function duplicateFestivalYearMessage(year: number): string {
  return `A festival for ${year} already exists.`;
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
