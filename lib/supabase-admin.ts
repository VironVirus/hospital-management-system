import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serverKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
