import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | null = null;

/**
 * Service-role client for trusted server-side code only (API routes, the
 * orchestrator, background jobs). Bypasses RLS - never import this into
 * client components or anything that runs in the browser.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (!client) {
    client = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return client;
}
