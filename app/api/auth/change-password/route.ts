import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { createSession, getCurrentSession } from "@/lib/auth-session";
import { getPool } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/security";

const passwordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(12).max(72)
});

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "The new password must contain at least 12 characters." }, { status: 400 });
    if (parsed.data.current_password === parsed.data.new_password) {
      return NextResponse.json({ error: "Choose a different new password." }, { status: 400 });
    }
    const [rows] = await getPool().query<RowDataPacket[]>("SELECT password_hash FROM profiles WHERE id = ? LIMIT 1", [session.user.id]);
    if (!rows[0] || !(await verifyPassword(parsed.data.current_password, String(rows[0].password_hash)))) {
      return NextResponse.json({ error: "The current password is incorrect." }, { status: 400 });
    }
    await getPool().execute(
      "UPDATE profiles SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3) WHERE id = ?",
      [await hashPassword(parsed.data.new_password), session.user.id]
    );
    await getPool().execute("DELETE FROM user_sessions WHERE user_id = ?", [session.user.id]);
    await createSession(session.user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The password could not be changed." }, { status: 500 });
  }
}
