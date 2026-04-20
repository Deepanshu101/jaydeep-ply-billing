import type { SupabaseClient } from "@supabase/supabase-js";

export async function safeCount(
  supabase: SupabaseClient,
  table: string,
  build?: (query: ReturnType<SupabaseClient["from"]> extends infer T ? T : never) => unknown,
) {
  try {
    let query = supabase.from(table).select("*", { count: "exact", head: true });
    if (build) query = build(query as never) as typeof query;
    const { count } = await query;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function safeRows<T>(
  promise: PromiseLike<{ data: T[] | null; error: unknown }>,
  fallback: T[] = [],
) {
  try {
    const { data, error } = await promise;
    if (error) return fallback;
    return data ?? fallback;
  } catch {
    return fallback;
  }
}
