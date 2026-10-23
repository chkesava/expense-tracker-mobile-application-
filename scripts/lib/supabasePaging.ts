/**
 * Every row of a Supabase/PostgREST read, 1,000 at a time. PostgREST caps a
 * response at the project's max rows (1,000 on Supabase) without an error, so
 * any read that can exceed it must page, with a stable order, or it silently
 * drops rows.
 */
export const SUPABASE_PAGE = 1000;

export async function all<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE) {
    const { data, error } = await page(from, from + SUPABASE_PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < SUPABASE_PAGE) return out;
  }
}
