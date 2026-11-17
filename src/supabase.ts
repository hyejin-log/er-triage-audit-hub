// [개발 > 인증] Supabase 클라이언트 — Vercel Supabase 연동(접두어 SUPA)이 SUPA_VITE_SUPABASE_URL / _ANON_KEY 를 넣어 줍니다.
// anon key 는 브라우저에 공개돼도 되는 키입니다. (service_role 키는 절대 프론트엔드에 넣지 않습니다)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const env = import.meta.env;
const url = (env.VITE_SUPABASE_URL || env.SUPA_VITE_SUPABASE_URL) as string | undefined;
const anonKey = (env.VITE_SUPABASE_ANON_KEY || env.SUPA_VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
      })
    : null;

export const authEnabled = supabase !== null;
