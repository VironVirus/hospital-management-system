import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNextPath = requestUrl.searchParams.get("next") || "/dashboard";
  const nextPath = requestedNextPath.startsWith("/") && !requestedNextPath.startsWith("//")
    ? requestedNextPath
    : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const supabase = createSupabaseServerClient(request, response);

  if (!supabase) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  return response;
}
