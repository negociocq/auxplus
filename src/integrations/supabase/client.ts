import { createClient } from "@supabase/supabase-js";

// Force Supabase configuration for this project
export const isSupabaseConfigured = true;

export const SUPABASE_URL = "https://jcuehnzaonhdcjbxhadz.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjdWVobnphb25oZGNqYnhoYWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTUzMTEsImV4cCI6MjEwMDgzMTMxMX0.Qr8gPL_nfgS6R0YbluZLpnA1a_CQp3Cu1_GXk-1TFI8";

/** Proxy UniPlay em produção (Edge Function Supabase). */
export const GES_API_PROXY_URL = `${SUPABASE_URL}/functions/v1/gesapi`;

// Supabase client instance
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
