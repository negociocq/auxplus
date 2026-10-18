import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { createPhotoConfigHandler } from "../_shared/adminPhotoConfig.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const verify = async (plain: string, stored: string) => {
  if (!stored) return false;
  if (/^\$2[aby]\$\d{2}\$/.test(stored)) return bcrypt.compare(plain, stored.replace(/^\$2y\$/, "$2a$"));
  return plain === stored;
};
Deno.serve(createPhotoConfigHandler(client, verify, Deno.env.get("OPENAI_API_KEY") || ""));
