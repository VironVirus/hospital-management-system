import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { createPreviewSession, createSession, getCurrentSession } from "@/lib/auth-session";
import { getPool, migrateDatabase } from "@/lib/db";
import { verifyPassword } from "@/lib/security";

type LoginRow = RowDataPacket & { id: string; password_hash: string; is_active: number; approval_status: string };

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { email?: string; identifier?: string; password?: string } | null;
  const identifier = (payload?.identifier || payload?.email || "").trim().toLowerCase();

  try {
    if (!identifier || !payload?.password) {
      return NextResponse.json({ error: "Enter your login ID and password." }, { status: 400 });
    }
    await migrateDatabase();
    const [rows] = await getPool().query<LoginRow[]>(
      "SELECT id, password_hash, is_active, approval_status FROM profiles WHERE LOWER(email) = ? LIMIT 1",
      [identifier]
    );
    const account = rows[0];
    if (!account || !(await verifyPassword(payload.password, account.password_hash))) {
      return NextResponse.json({ error: "Invalid login details." }, { status: 401 });
    }
    if (!account.is_active || account.approval_status !== "Approved") {
      return NextResponse.json({ error: "This staff account is not active." }, { status: 403 });
    }
    await createSession(account.id);
    return NextResponse.json({ session: await getCurrentSession() });
  } catch (error) {
    console.error("[auth-login]", error);
    if (await createPreviewSession(identifier, payload?.password || "")) {
      return NextResponse.json({ session: await getCurrentSession() });
    }
    return NextResponse.json({ error: "Sign-in unavailable." }, { status: 500 });
  }
}
