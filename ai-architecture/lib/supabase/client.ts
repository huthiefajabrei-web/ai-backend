// ============================================================
// SUPABASE CLIENT - معلّق مؤقتاً (لم يُحذف)
// تم الانتقال إلى MySQL عبر lib/mysql/client.ts
// ============================================================
/*
"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createBrowserClient(url, key);
}
*/

// Stub export so existing imports don't break during transition
export function createClient() {
  throw new Error("Supabase has been disabled. Use lib/mysql/client.ts instead.");
}
