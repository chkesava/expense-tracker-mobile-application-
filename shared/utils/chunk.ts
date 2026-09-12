/**
 * Split a list into fixed-size groups — KAN-73.
 *
 * Lifted out of `hooks/useEpfContributions.ts`, where it was pure but unrunnable
 * because vitest does not include `hooks/**`. It backs every Firestore batch in
 * the EPF module, so the 500-write limit depends on it being right.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}
