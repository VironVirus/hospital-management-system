import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured, migrateDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { status: "not_ready", database: "not_configured" },
      { status: 503 }
    );
  }

  try {
    await migrateDatabase();
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "connected" });
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "connection_failed" },
      { status: 503 }
    );
  }
}
