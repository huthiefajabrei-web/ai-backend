// ============================================================
// SUPABASE AUTH CALLBACK - معلّق مؤقتاً (لم يُحذف)
// تم الانتقال إلى MySQL - لا حاجة لـ OAuth callback
// ============================================================
/*
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
*/

import { NextResponse } from "next/server";

// Redirect to login - OAuth no longer used with MySQL auth
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`);
}
