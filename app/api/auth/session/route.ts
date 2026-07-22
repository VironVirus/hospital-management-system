import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth-session";

export async function GET() {
  return NextResponse.json({ session: await getCurrentSession() });
}
