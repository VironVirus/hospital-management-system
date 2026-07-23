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
  } catch (error) {
    const databaseError = error as { code?: string; errno?: number; message?: string };
    const code = databaseError.code || "UNKNOWN";
    console.error("[database-health]", { code, errno: databaseError.errno, message: databaseError.message });
    return NextResponse.json(
      { status: "unavailable", database: "connection_failed", code },
      { status: 503 }
    );
  }
}
