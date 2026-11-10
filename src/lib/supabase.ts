import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

// Server-side client using the service role key. Never import this in browser code.
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
  }
  return client;
}
