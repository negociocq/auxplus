import { createClient } from "@supabase/supabase-js";

// Force Supabase configuration for this project
export const isSupabaseConfigured = true;

export const SUPABASE_URL = "https://gankvvanazlkniciracw.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_p1uoxJlOESvqw73asJLhYw_ABEhI0NT";

/** Proxy UniPlay em produção (Edge Function Supabase). */
export const GES_API_PROXY_URL = `${SUPABASE_URL}/functions/v1/gesapi`;

// Supabase client instance
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
