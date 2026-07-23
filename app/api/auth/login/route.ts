import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { createSession, getCurrentSession } from "@/lib/auth-session";
import { getPool, migrateDatabase } from "@/lib/db";
import { verifyPassword } from "@/lib/security";

type LoginRow = RowDataPacket & { id: string; password_hash: string; is_active: number; approval_status: string };

export async function POST(request: Request) {
  try {
    await migrateDatabase();
    const payload = await request.json().catch(() => null) as { email?: string; password?: string } | null;
    const email = payload?.email?.trim().toLowerCase();
    if (!email || !payload?.password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
    const [rows] = await getPool().query<LoginRow[]>(
      "SELECT id, password_hash, is_active, approval_status FROM profiles WHERE email = ? LIMIT 1",
      [email]
    );
    const account = rows[0];
    if (!account || !(await verifyPassword(payload.password, account.password_hash))) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    if (!account.is_active || account.approval_status !== "Approved") {
      return NextResponse.json({ error: "This staff account is not active." }, { status: 403 });
    }
    await createSession(account.id);
    return NextResponse.json({ session: await getCurrentSession() });
  } catch (error) {
    console.error("[auth-login]", error);
    return NextResponse.json({ error: "Sign-in unavailable." }, { status: 500 });
  }
}
