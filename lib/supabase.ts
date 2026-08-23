import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env, isSupabaseEnvConfigured } from "@/lib/env";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseEnvConfigured()) {
    throw new Error("Storage is not configured.");
  }
  if (!client) {
    client = createClient(env.supabase.url, env.supabase.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
